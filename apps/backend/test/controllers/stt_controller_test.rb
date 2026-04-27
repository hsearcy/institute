require "test_helper"
require "stringio"

class SttControllerTest < ActionDispatch::IntegrationTest
  class StubPreRecorded
    class << self; attr_accessor :transcript, :raise_with, :captured_ct; end
    def self.transcribe(audio_bytes:, content_type:, http: nil)
      raise raise_with if raise_with
      self.captured_ct = content_type
      transcript
    end
  end

  setup do
    StubPreRecorded.transcript = "two"
    StubPreRecorded.raise_with = nil
    StubPreRecorded.captured_ct = nil
  end

  test "POST /stt returns normalized result for a valid utterance" do
    with_pre_recorded(StubPreRecorded) do
      post "/stt", params: { audio: fixture_audio, expected_answers: "2,4,6" }
    end
    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal "two",  body["transcript"]
    assert_equal 2,      body["normalized"]
    assert_equal "high", body["confidence"]
  end

  test "returns low confidence when transcript number is not in expected" do
    StubPreRecorded.transcript = "six"
    with_pre_recorded(StubPreRecorded) do
      post "/stt", params: { audio: fixture_audio, expected_answers: "2,4" }
    end
    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal "low", body["confidence"]
    assert_equal 6,     body["normalized"]
  end

  test "returns no_match when transcript has no number" do
    StubPreRecorded.transcript = "blah"
    with_pre_recorded(StubPreRecorded) do
      post "/stt", params: { audio: fixture_audio, expected_answers: "2,4" }
    end
    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal "no_match", body["confidence"]
    assert_nil body["normalized"]
  end

  test "returns 422 when audio is missing" do
    post "/stt", params: { expected_answers: "2" }
    assert_response :unprocessable_entity
  end

  test "returns 502 when Deepgram fails" do
    StubPreRecorded.raise_with = Stt::PreRecorded::StreamError.new(401, "bad key")
    with_pre_recorded(StubPreRecorded) do
      post "/stt", params: { audio: fixture_audio, expected_answers: "2" }
    end
    assert_response :bad_gateway
  end

  test "auth: bearer required when TUTOR_SHARED_SECRET set" do
    with_env("TUTOR_SHARED_SECRET" => "shh") do
      with_pre_recorded(StubPreRecorded) do
        post "/stt", params: { audio: fixture_audio, expected_answers: "2" }
      end
    end
    assert_response :unauthorized
  end

  private

  def fixture_audio
    Rack::Test::UploadedFile.new(StringIO.new("fakeaudiobytes"), "audio/m4a", original_filename: "round.m4a")
  end

  def with_pre_recorded(stub)
    original = SttController.pre_recorded
    SttController.pre_recorded = stub
    yield
  ensure
    SttController.pre_recorded = original
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
