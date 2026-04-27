require "faraday"

module Stt
  # Single-shot transcription via Deepgram's pre-recorded HTTP API.
  # The kid-app uploads a complete recording (M4A/AAC); we forward the
  # bytes to Deepgram, parse out the transcript, and hand it to the
  # SpeechNormalizer.
  #
  # This is the V1 path because expo-audio (in Expo Go) doesn't expose
  # streaming chunks. The streaming WS path (Stt::DeepgramSession +
  # SttChannel) is preserved for a future custom-dev-client setup.
  module PreRecorded
    DEEPGRAM_URL = "https://api.deepgram.com/v1/listen?" \
                   "model=nova-2&language=en&numerals=true&punctuate=false".freeze

    class StreamError < StandardError
      attr_reader :status, :body
      def initialize(status, body)
        @status = status
        @body = body
        super("Deepgram returned #{status}: #{body}")
      end
    end

    # `audio_bytes`: raw bytes of an audio file (M4A, MP3, WAV, etc.)
    # `content_type`: MIME type ("audio/m4a" / "audio/mp4" / etc.)
    # Returns the parsed transcript string (may be empty).
    def self.transcribe(audio_bytes:, content_type:, http: RealHttp)
      payload = http.post(DEEPGRAM_URL, audio_bytes, content_type)
      payload.dig("results", "channels", 0, "alternatives", 0, "transcript").to_s
    end

    module RealHttp
      def self.post(url, audio_bytes, content_type)
        conn = Faraday.new { |f| f.adapter :net_http }
        response = conn.post(url) do |req|
          req.headers["Authorization"] = "Token #{ENV.fetch('DEEPGRAM_API_KEY')}"
          req.headers["Content-Type"] = content_type
          req.body = audio_bytes
        end
        if response.status >= 400
          raise StreamError.new(response.status, response.body.to_s)
        end
        JSON.parse(response.body)
      end
    end
  end
end
