require "faraday"

module Tts
  module Stream
    DEFAULT_VOICE_ID = ENV.fetch("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
    DEFAULT_MODEL_ID = "eleven_turbo_v2_5"
    BASE = "https://api.elevenlabs.io".freeze

    class StreamError < StandardError
      attr_reader :status, :body
      def initialize(status, body)
        @status = status
        @body = body
        super("ElevenLabs returned #{status}: #{body}")
      end
    end

    module RealHttp
      def self.post(url, body, headers, &on_chunk)
        conn = Faraday.new do |f|
          f.adapter :net_http
        end
        response = conn.post(url) do |req|
          req.headers.merge!(headers)
          req.body = body
          req.options.on_data = proc { |chunk, _| on_chunk.call(chunk) if chunk && !chunk.empty? }
        end
        raise StreamError.new(response.status, response.body) if response.status >= 400
      end
    end

    def self.call(text:, voice_id: DEFAULT_VOICE_ID, http: RealHttp, &on_chunk)
      url = "#{BASE}/v1/text-to-speech/#{voice_id}/stream"
      headers = {
        "xi-api-key"   => ENV["ELEVENLABS_API_KEY"].to_s,
        "accept"       => "audio/mpeg",
        "content-type" => "application/json",
      }
      body = JSON.generate(
        text: text,
        model_id: DEFAULT_MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.7 },
      )
      http.post(url, body, headers, &on_chunk)
    end
  end
end
