"""
Nova 2 Sonic S2Sイベント定義

ワークショップサンプルベースのイベント構築ヘルパー。
"""
import json


class S2sEvent:
    """Nova Sonic双方向ストリーミング用イベント構築クラス"""

    DEFAULT_INFER_CONFIG = {
        "maxTokens": 1024,
        "topP": 0.95,
        "temperature": 0.7,
    }

    DEFAULT_AUDIO_INPUT_CONFIG = {
        "mediaType": "audio/lpcm",
        "sampleRateHertz": 16000,
        "sampleSizeBits": 16,
        "channelCount": 1,
        "audioType": "SPEECH",
        "encoding": "base64",
    }

    DEFAULT_AUDIO_OUTPUT_CONFIG = {
        "mediaType": "audio/lpcm",
        "sampleRateHertz": 24000,
        "sampleSizeBits": 16,
        "channelCount": 1,
        "voiceId": "tomo",
        "encoding": "base64",
        "audioType": "SPEECH",
    }

    @staticmethod
    def session_start(inference_config=None):
        return {
            "event": {
                "sessionStart": {
                    "inferenceConfiguration": inference_config or S2sEvent.DEFAULT_INFER_CONFIG
                }
            }
        }

    @staticmethod
    def prompt_start(prompt_name, audio_output_config=None):
        return {
            "event": {
                "promptStart": {
                    "promptName": prompt_name,
                    "textOutputConfiguration": {"mediaType": "text/plain"},
                    "audioOutputConfiguration": audio_output_config or S2sEvent.DEFAULT_AUDIO_OUTPUT_CONFIG,
                    "toolUseOutputConfiguration": {"mediaType": "application/json"},
                    "toolConfiguration": {"tools": []},
                }
            }
        }

    @staticmethod
    def content_start_text(prompt_name, content_name, interactive=False, role="SYSTEM"):
        return {
            "event": {
                "contentStart": {
                    "promptName": prompt_name,
                    "contentName": content_name,
                    "type": "TEXT",
                    "interactive": interactive,
                    "role": role,
                    "textInputConfiguration": {"mediaType": "text/plain"},
                }
            }
        }

    @staticmethod
    def text_input(prompt_name, content_name, content):
        return {
            "event": {
                "textInput": {
                    "promptName": prompt_name,
                    "contentName": content_name,
                    "content": content,
                }
            }
        }

    @staticmethod
    def content_end(prompt_name, content_name):
        return {
            "event": {
                "contentEnd": {
                    "promptName": prompt_name,
                    "contentName": content_name,
                }
            }
        }

    @staticmethod
    def content_start_audio(prompt_name, content_name, audio_input_config=None):
        return {
            "event": {
                "contentStart": {
                    "promptName": prompt_name,
                    "contentName": content_name,
                    "type": "AUDIO",
                    "interactive": True,
                    "audioInputConfiguration": audio_input_config or S2sEvent.DEFAULT_AUDIO_INPUT_CONFIG,
                }
            }
        }

    @staticmethod
    def audio_input(prompt_name, content_name, content):
        return {
            "event": {
                "audioInput": {
                    "promptName": prompt_name,
                    "contentName": content_name,
                    "content": content,
                }
            }
        }

    @staticmethod
    def prompt_end(prompt_name):
        return {"event": {"promptEnd": {"promptName": prompt_name}}}

    @staticmethod
    def session_end():
        return {"event": {"sessionEnd": {}}}
