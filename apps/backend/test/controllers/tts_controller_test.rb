require "test_helper"

class TtsControllerTest < ActionDispatch::IntegrationTest
  class StubStream
    class << self
      attr_accessor :chunks, :raise_with, :captured_text, :captured_voice
    end

    def self.call(text:, voice_id: nil, http: nil, &block)
      self.captured_text = text
      self.captured_voice = voice_id
      raise raise_with if raise_with
      chunks.each { |c| block.call(c) }
    end
  end

  setup do
    StubStream.chunks = ["aaa", "bbb"]
    StubStream.raise_with = nil
    StubStream.captured_text = nil
    StubStream.captured_voice = nil
  end

  test "POST /tts streams body and sets audio/mpeg" do
    with_stream(StubStream) do
      post "/tts", params: { text: "hello world" }, as: :json
    end
    assert_response :ok
    assert_equal "audio/mpeg", response.headers["Content-Type"]
    assert_equal "aaabbb", response.body
    assert_equal "hello world", StubStream.captured_text
  end

  test "passes voiceId param through to the service" do
    with_stream(StubStream) do
      post "/tts", params: { text: "x", voiceId: "voice42" }, as: :json
    end
    assert_equal "voice42", StubStream.captured_voice
  end

  test "returns 422 when text is missing" do
    post "/tts", params: {}, as: :json
    assert_response :unprocessable_entity
  end

  test "returns 502 when stream raises" do
    StubStream.raise_with = Tts::Stream::StreamError.new(401, "nope")
    with_stream(StubStream) do
      post "/tts", params: { text: "x" }, as: :json
    end
    assert_response :bad_gateway
  end

  test "auth: bearer required when TUTOR_SHARED_SECRET set" do
    with_env("TUTOR_SHARED_SECRET" => "shh") do
      with_stream(StubStream) do
        post "/tts", params: { text: "x" }, as: :json
      end
    end
    assert_response :unauthorized
  end

  test "auth: bearer accepted when matching" do
    with_env("TUTOR_SHARED_SECRET" => "shh") do
      with_stream(StubStream) do
        post "/tts",
          params: { text: "x" },
          headers: { "Authorization" => "Bearer shh" },
          as: :json
      end
    end
    assert_response :ok
  end

  private

  def with_stream(stub)
    original = TtsController.tts_stream
    TtsController.tts_stream = stub
    yield
  ensure
    TtsController.tts_stream = original
  end

  def with_env(vars)
    originals = {}
    vars.each_key { |k| originals[k] = ENV.key?(k) ? ENV[k] : :__missing__ }
    vars.each { |k, v| v.nil? ? ENV.delete(k) : ENV[k] = v }
    yield
  ensure
    originals.each { |k, v| v == :__missing__ ? ENV.delete(k) : ENV[k] = v }
  end
end
