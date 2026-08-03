from types import SimpleNamespace
from unittest.mock import patch

from pipecat.services.settings import NOT_GIVEN
from pipecat.transcriptions.language import Language

from api.services.configuration.registry import (
    Deepgram2STTConfiguration,
    Deepgram3STTConfiguration,
    DeepgramSTTConfiguration,
    ServiceProviders,
)
from api.services.pipecat.audio_config import AudioConfig
from api.services.pipecat.service_factory import create_stt_service


def test_deepgram_stt_schema_includes_flux_multilingual_language_options():
    language_schema = DeepgramSTTConfiguration.model_json_schema()["properties"][
        "language"
    ]

    assert "flux-general-multi" in language_schema["model_options"]
    assert "multi" in language_schema["model_options"]["flux-general-multi"]
    assert "es" in language_schema["model_options"]["flux-general-multi"]


def test_create_deepgram_flux_multi_uses_flux_service_with_language_hint():
    user_config = SimpleNamespace(
        stt=SimpleNamespace(
            provider=ServiceProviders.DEEPGRAM.value,
            api_key="test-key",
            model="flux-general-multi",
            language="es",
        )
    )
    audio_config = AudioConfig(
        transport_in_sample_rate=16000,
        transport_out_sample_rate=16000,
    )

    with patch(
        "api.services.pipecat.service_factory.DeepgramFluxSTTService"
    ) as mock_service:
        create_stt_service(user_config, audio_config)

    kwargs = mock_service.call_args.kwargs
    assert kwargs["settings"].model == "flux-general-multi"
    assert kwargs["settings"].language_hints == [Language.ES]


def test_create_deepgram_flux_multi_omits_auto_detect_language_hint():
    user_config = SimpleNamespace(
        stt=SimpleNamespace(
            provider=ServiceProviders.DEEPGRAM.value,
            api_key="test-key",
            model="flux-general-multi",
            language="multi",
        )
    )
    audio_config = AudioConfig(
        transport_in_sample_rate=16000,
        transport_out_sample_rate=16000,
    )

    with patch(
        "api.services.pipecat.service_factory.DeepgramFluxSTTService"
    ) as mock_service:
        create_stt_service(user_config, audio_config)

    kwargs = mock_service.call_args.kwargs
    assert kwargs["settings"].model == "flux-general-multi"
    assert kwargs["settings"].language_hints is NOT_GIVEN


def test_deepgram_flux_uses_eu_inference_url():
    user_config = SimpleNamespace(
        stt=SimpleNamespace(
            provider=ServiceProviders.DEEPGRAM.value,
            api_key="test-key",
            model="flux-general-en",
            language="en",
        )
    )
    audio_config = AudioConfig(
        transport_in_sample_rate=16000,
        transport_out_sample_rate=16000,
    )

    with patch(
        "api.services.pipecat.service_factory.DeepgramFluxSTTService"
    ) as mock_service:
        create_stt_service(user_config, audio_config)

    kwargs = mock_service.call_args.kwargs
    assert kwargs["url"] == "wss://api.eu.deepgram.com/v2/listen"


def test_deepgram_nova_uses_eu_base_url():
    user_config = SimpleNamespace(
        stt=SimpleNamespace(
            provider=ServiceProviders.DEEPGRAM.value,
            api_key="test-key",
            model="nova-3-general",
            language="bs",
        )
    )
    audio_config = AudioConfig(
        transport_in_sample_rate=16000,
        transport_out_sample_rate=16000,
    )

    with patch(
        "api.services.pipecat.service_factory.DeepgramSTTService"
    ) as mock_service:
        create_stt_service(user_config, audio_config)

    kwargs = mock_service.call_args.kwargs
    assert kwargs["base_url"] == "api.eu.deepgram.com"
    assert kwargs["settings"].model == "nova-3-general"
    assert kwargs["settings"].language == "bs"


def test_deepgram_2_enables_live_agent_formatting_without_changing_deepgram():
    config = Deepgram2STTConfiguration(api_key="test-key", model="nova-3-general", language="bs")
    user_config = SimpleNamespace(stt=config)
    audio_config = AudioConfig(
        transport_in_sample_rate=16000,
        transport_out_sample_rate=16000,
    )

    with patch(
        "api.services.pipecat.service_factory.DeepgramSTTService"
    ) as mock_service:
        create_stt_service(user_config, audio_config)

    settings = mock_service.call_args.kwargs["settings"]
    assert settings.model == "nova-3-general"
    assert settings.language == "bs"
    assert settings.smart_format is True
    assert settings.interim_results is True
    assert settings.punctuate is True


def test_deepgram_3_applies_nova3_live_agent_defaults_without_changing_deepgram():
    config = Deepgram3STTConfiguration(
        api_key="test-key", model="nova-3-general", language="bs"
    )
    user_config = SimpleNamespace(stt=config)
    audio_config = AudioConfig(
        transport_in_sample_rate=16000,
        transport_out_sample_rate=16000,
    )

    with patch(
        "api.services.pipecat.service_factory.DeepgramSTTService"
    ) as mock_service:
        create_stt_service(user_config, audio_config, keyterms=["boost-me"])

    settings = mock_service.call_args.kwargs["settings"]
    assert settings.model == "nova-3-general"
    assert settings.language == "bs"
    assert settings.smart_format is True
    assert settings.punctuate is True
    assert settings.numerals is True
    assert settings.interim_results is False
    assert settings.diarize is False
    assert settings.endpointing == 400
    assert settings.extra.get("vad_events") is True
    # Keyterm prompting and utterance_end_ms are intentionally not set.
    assert settings.keyterm is NOT_GIVEN
    assert settings.utterance_end_ms is NOT_GIVEN


def test_deepgram_3_schema_title_and_provider():
    schema = Deepgram3STTConfiguration.model_json_schema()
    assert schema["title"] == "Deepgram 3"
    assert Deepgram3STTConfiguration.model_fields["provider"].default == ServiceProviders.DEEPGRAM_3


def test_original_deepgram_defaults_unchanged_when_deepgram_3_exists():
    config = DeepgramSTTConfiguration(
        api_key="test-key", model="nova-3-general", language="bs"
    )
    user_config = SimpleNamespace(stt=config)
    audio_config = AudioConfig(
        transport_in_sample_rate=16000,
        transport_out_sample_rate=16000,
    )

    with patch(
        "api.services.pipecat.service_factory.DeepgramSTTService"
    ) as mock_service:
        create_stt_service(user_config, audio_config, keyterms=["boost-me"])

    settings = mock_service.call_args.kwargs["settings"]
    assert settings.model == "nova-3-general"
    assert settings.language == "bs"
    assert settings.endpointing == 100
    assert settings.profanity_filter is False
    assert settings.keyterm == ["boost-me"]
    # Original Deepgram does not force these live-agent flags.
    assert settings.smart_format is NOT_GIVEN
    assert settings.punctuate is NOT_GIVEN
    assert settings.numerals is NOT_GIVEN
    assert settings.interim_results is NOT_GIVEN
    assert settings.diarize is NOT_GIVEN


def test_deepgram_tts_uses_eu_ws_base_url():
    from api.services.pipecat.service_factory import create_tts_service

    user_config = SimpleNamespace(
        tts=SimpleNamespace(
            provider=ServiceProviders.DEEPGRAM.value,
            api_key="test-key",
            voice="aura-asteria-en",
            model=None,
        )
    )
    audio_config = AudioConfig(
        transport_in_sample_rate=16000,
        transport_out_sample_rate=16000,
    )

    with patch(
        "api.services.pipecat.service_factory.DeepgramTTSService"
    ) as mock_service:
        create_tts_service(user_config, audio_config)

    kwargs = mock_service.call_args.kwargs
    assert kwargs["base_url"] == "wss://api.eu.deepgram.com"
