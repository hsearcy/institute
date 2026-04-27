module Stt
  class DeepgramSession
    DEEPGRAM_WS = "wss://api.deepgram.com/v1/listen?" \
                  "model=nova-2&endpointing=300&interim_results=false&" \
                  "language=en&punctuate=false&numerals=true&encoding=linear16&sample_rate=16000".freeze

    def initialize(expected_answers:, ws: nil, &on_event)
      @expected_answers = expected_answers
      @on_event = on_event
      @ws = ws  # injectable for tests; nil means we'll build a real one in start
      @open = false
      @buffer = []
    end

    def start
      @ws ||= build_real_ws
      @ws.on(:open) do
        @open = true
        @buffer.each { |b| @ws.send(b) }
        @buffer.clear
      end
      @ws.on(:message) { |event| handle_message(event.data) }
      @ws.on(:close) do
        @open = false
      end
      self
    end

    def send_audio(frame)
      if @open
        @ws.send(frame)
      else
        @buffer << frame
      end
    end

    def close
      @ws&.close
    end

    private

    def handle_message(data)
      payload = JSON.parse(data) rescue nil
      return unless payload
      return unless payload["is_final"] && payload["speech_final"]
      transcript = payload.dig("channel", "alternatives", 0, "transcript").to_s
      return if transcript.strip.empty?
      result = Tutor::SpeechNormalizer.call(transcript, @expected_answers)
      @on_event&.call(result)
    end

    def build_real_ws
      require "faye/websocket"
      headers = { "Authorization" => "Token #{ENV.fetch('DEEPGRAM_API_KEY')}" }
      Faye::WebSocket::Client.new(DEEPGRAM_WS, [], headers: headers)
    end
  end
end
