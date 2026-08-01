from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from pipecat.transcriptions.language import Language

from api.services.configuration.check_validity import UserConfigurationValidator
from api.services.configuration.registry import (
    FISH_AUDIO_LATENCY_MODES,
    FISH_AUDIO_TTS_MODELS,
    FishAudioTTSConfiguration,
    ServiceProviders,
)
from api.services.pipecat.service_factory import create_tts_service


def test_fish_audio_tts_configuration_defaults():
    config = FishAudioTTSConfiguration(api_key="test-key", voice="voice-ref-id")

    assert config.provider == ServiceProviders.FISH_AUDIO
    assert config.voice == "voice-ref-id"
    assert config.language == "en"
    assert config.model == "s2-pro"
    assert config.latency == "balanced"
    assert config.speed == 1.0
    assert config.volume == 0
    assert config.normalize is True
    assert "s2-pro" in FISH_AUDIO_TTS_MODELS
    assert "balanced" in FISH_AUDIO_LATENCY_MODES
    assert "bs" in config.model_fields["language"].json_schema_extra["examples"]


@pytest.mark.parametrize("transport_out_sample_rate", [8000, 16000, 24000])
def test_create_fish_audio_tts_service_uses_pcm_and_pipeline_sample_rate(
    transport_out_sample_rate,
):
    user_config = SimpleNamespace(
        tts=SimpleNamespace(
            provider=ServiceProviders.FISH_AUDIO.value,
            api_key="test-key",
            model="s2.1-pro",
            voice="abc123voice",
            language="bs",
            latency="balanced",
            speed=1.1,
            volume=2,
            normalize=True,
        )
    )
    audio_config = SimpleNamespace(
        transport_out_sample_rate=transport_out_sample_rate,
        transport_in_sample_rate=16000,
    )

    with patch(
        "api.services.pipecat.service_factory.FishAudioTTSService"
    ) as mock_service:
        create_tts_service(user_config, audio_config)

    assert mock_service.call_count == 1
    kwargs = mock_service.call_args.kwargs
    assert kwargs["api_key"] == "test-key"
    assert kwargs["sample_rate"] == transport_out_sample_rate
    assert kwargs["output_format"] == "pcm"
    assert kwargs["settings"].voice == "abc123voice"
    assert kwargs["settings"].model == "s2.1-pro"
    assert kwargs["settings"].latency == "balanced"
    assert kwargs["settings"].prosody_speed == 1.1
    assert kwargs["settings"].prosody_volume == 2
    assert kwargs["settings"].normalize is True
    assert kwargs["settings"].language == Language.BS


def test_create_fish_audio_tts_service_defaults_latency_to_balanced():
    user_config = SimpleNamespace(
        tts=SimpleNamespace(
            provider=ServiceProviders.FISH_AUDIO.value,
            api_key="test-key",
            model="s2-pro",
            voice="voice-id",
            language="en",
            latency="invalid-mode",
            speed=1.0,
            volume=0,
            normalize=True,
        )
    )
    audio_config = SimpleNamespace(
        transport_out_sample_rate=24000,
        transport_in_sample_rate=16000,
    )

    with patch(
        "api.services.pipecat.service_factory.FishAudioTTSService"
    ) as mock_service:
        create_tts_service(user_config, audio_config)

    kwargs = mock_service.call_args.kwargs
    assert kwargs["settings"].latency == "balanced"


def test_create_fish_audio_tts_service_requires_voice():
    user_config = SimpleNamespace(
        tts=SimpleNamespace(
            provider=ServiceProviders.FISH_AUDIO.value,
            api_key="test-key",
            model="s2-pro",
            voice=None,
            language="en",
            latency="balanced",
            speed=1.0,
            volume=0,
            normalize=True,
        )
    )
    audio_config = SimpleNamespace(
        transport_out_sample_rate=24000,
        transport_in_sample_rate=16000,
    )

    with pytest.raises(HTTPException) as exc_info:
        create_tts_service(user_config, audio_config)
    assert exc_info.value.status_code == 400
    assert "voice" in exc_info.value.detail.lower()


def test_create_fish_audio_tts_service_allows_normal_latency():
    user_config = SimpleNamespace(
        tts=SimpleNamespace(
            provider=ServiceProviders.FISH_AUDIO.value,
            api_key="test-key",
            model="s2-pro",
            voice="voice-id",
            language="de",
            latency="normal",
            speed=1.0,
            volume=0,
            normalize=False,
        )
    )
    audio_config = SimpleNamespace(
        transport_out_sample_rate=24000,
        transport_in_sample_rate=16000,
    )

    with patch(
        "api.services.pipecat.service_factory.FishAudioTTSService"
    ) as mock_service:
        create_tts_service(user_config, audio_config)

    kwargs = mock_service.call_args.kwargs
    assert kwargs["settings"].latency == "normal"
    assert kwargs["settings"].normalize is False
    assert kwargs["settings"].language == Language.DE


def test_fish_audio_is_registered_for_key_validation():
    validator = UserConfigurationValidator()
    assert ServiceProviders.FISH_AUDIO.value in validator._validator_map


def test_fish_audio_key_validation_accepts_valid_key():
    validator = UserConfigurationValidator()
    with patch("api.services.configuration.check_validity.httpx.get") as mock_get:
        mock_get.return_value.status_code = 200
        assert (
            validator._check_fish_audio_api_key("s2-pro", "fish-valid-key") is True
        )
    called_url = mock_get.call_args.args[0]
    assert called_url == "https://api.fish.audio/model"
    headers = mock_get.call_args.kwargs["headers"]
    assert headers["Authorization"] == "Bearer fish-valid-key"


def test_fish_audio_key_validation_rejects_bad_key():
    validator = UserConfigurationValidator()
    with patch("api.services.configuration.check_validity.httpx.get") as mock_get:
        mock_get.return_value.status_code = 401
        with pytest.raises(ValueError):
            validator._check_fish_audio_api_key("s2-pro", "bad-key")
