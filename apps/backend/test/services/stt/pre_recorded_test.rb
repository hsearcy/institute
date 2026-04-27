require "test_helper"

class Stt::PreRecordedTest < ActiveSupport::TestCase
  class StubHttp
    attr_reader :captured_url, :captured_audio, :captured_ct
    def initialize(payload:, raise_with: nil)
      @payload = payload
      @raise_with = raise_with
    end
    def post(url, audio, ct)
      @captured_url = url
      @captured_audio = audio
      @captured_ct = ct
      raise @raise_with if @raise_with
      @payload
    end
  end

  test "returns the transcript from a Deepgram payload" do
    payload = { "results" => { "channels" => [{ "alternatives" => [{ "transcript" => "two" }] }] } }
    http = StubHttp.new(payload: payload)
    assert_equal "two", Stt::PreRecorded.transcribe(audio_bytes: "abc", content_type: "audio/m4a", http: http)
  end

  test "returns empty string when transcript path is missing" do
    http = StubHttp.new(payload: { "results" => {} })
    assert_equal "", Stt::PreRecorded.transcribe(audio_bytes: "abc", content_type: "audio/m4a", http: http)
  end

  test "passes content_type through to the HTTP layer" do
    http = StubHttp.new(payload: { "results" => { "channels" => [{ "alternatives" => [{ "transcript" => "x" }] }] } })
    Stt::PreRecorded.transcribe(audio_bytes: "abc", content_type: "audio/wav", http: http)
    assert_equal "audio/wav", http.captured_ct
  end

  test "raises StreamError on HTTP failure" do
    http = StubHttp.new(payload: nil, raise_with: Stt::PreRecorded::StreamError.new(401, "bad key"))
    assert_raises(Stt::PreRecorded::StreamError) do
      Stt::PreRecorded.transcribe(audio_bytes: "abc", content_type: "audio/m4a", http: http)
    end
  end
end
