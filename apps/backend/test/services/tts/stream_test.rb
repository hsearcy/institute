require "test_helper"

class Tts::StreamTest < ActiveSupport::TestCase
  class StubHttp
    attr_reader :captured_url, :captured_headers, :captured_body
    def initialize(chunks:, status: 200, error_body: nil)
      @chunks = chunks
      @status = status
      @error_body = error_body
    end
    def post(url, body, headers, &on_chunk)
      @captured_url = url
      @captured_headers = headers
      @captured_body = body
      raise Tts::Stream::StreamError.new(@status, @error_body) if @status >= 400
      @chunks.each { |c| on_chunk.call(c) }
    end
  end

  test "happy path: yields each chunk in order" do
    chunks = []
    http = StubHttp.new(chunks: ["aaa", "bbb", "ccc"])
    Tts::Stream.call(text: "hello", voice_id: "voice123", http: http) { |c| chunks << c }
    assert_equal ["aaa", "bbb", "ccc"], chunks
  end

  test "POSTs to the ElevenLabs streaming URL with the given voice_id" do
    http = StubHttp.new(chunks: [])
    Tts::Stream.call(text: "hi", voice_id: "voice42", http: http) {}
    assert_includes http.captured_url, "voice42/stream"
  end

  test "sends xi-api-key from ENV" do
    ENV["ELEVENLABS_API_KEY"] = "sekret"
    http = StubHttp.new(chunks: [])
    Tts::Stream.call(text: "hi", voice_id: "v", http: http) {}
    assert_equal "sekret", http.captured_headers["xi-api-key"]
  ensure
    ENV.delete("ELEVENLABS_API_KEY")
  end

  test "request body has text + model_id" do
    http = StubHttp.new(chunks: [])
    Tts::Stream.call(text: "speak this", voice_id: "v", http: http) {}
    body = JSON.parse(http.captured_body)
    assert_equal "speak this", body["text"]
    assert_match(/turbo|flash/, body["model_id"])
  end

  test "raises StreamError on non-2xx" do
    http = StubHttp.new(chunks: [], status: 401, error_body: "bad key")
    assert_raises(Tts::Stream::StreamError) do
      Tts::Stream.call(text: "x", voice_id: "v", http: http) {}
    end
  end
end
