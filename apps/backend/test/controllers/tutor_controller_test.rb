require "test_helper"
require "json"

class TutorControllerTest < ActionDispatch::IntegrationTest
  setup do
    @valid_request    = JSON.parse(file_fixture("valid_request.json").read)
    @canned_response  = JSON.parse(file_fixture("llm_response_skip_count_2.json").read)
  end

  class StubPicker
    class << self
      attr_accessor :reply, :raise_with
    end
    def self.call(payload, **_)
      raise raise_with if raise_with
      reply
    end
  end

  test "POST /tutor/next_round returns 200 + LLM body on happy path" do
    StubPicker.reply = @canned_response
    StubPicker.raise_with = nil
    with_picker(StubPicker) do
      post "/tutor/next_round", params: @valid_request, as: :json
    end
    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal "skip_count_2", body["skillId"]
    assert_equal "spell-cast",   body["pluginId"]
    assert_equal [2, 4, 6, 8, 10], body.dig("params", "sequence")
  end

  test "returns 422 on missing eligiblePool" do
    bad = @valid_request.deep_dup.tap { |h| h.delete("eligiblePool") }
    post "/tutor/next_round", params: bad, as: :json
    assert_response :unprocessable_entity
  end

  test "returns 502 when picker raises InvalidResponse" do
    StubPicker.reply = nil
    StubPicker.raise_with = Tutor::Picker::InvalidResponse.new("nope")
    with_picker(StubPicker) do
      post "/tutor/next_round", params: @valid_request, as: :json
    end
    assert_response :bad_gateway
  end

  test "returns 422 when picker raises NoEligibleContent" do
    StubPicker.reply = nil
    StubPicker.raise_with = Tutor::Picker::NoEligibleContent.new("empty")
    with_picker(StubPicker) do
      post "/tutor/next_round", params: @valid_request, as: :json
    end
    assert_response :unprocessable_entity
  end

  test "auth: when TUTOR_SHARED_SECRET is set, request without bearer is 401" do
    StubPicker.reply = @canned_response
    StubPicker.raise_with = nil
    with_env("TUTOR_SHARED_SECRET" => "supersecret") do
      with_picker(StubPicker) do
        post "/tutor/next_round", params: @valid_request, as: :json
      end
    end
    assert_response :unauthorized
  end

  test "auth: when TUTOR_SHARED_SECRET is set, request with correct bearer is 200" do
    StubPicker.reply = @canned_response
    StubPicker.raise_with = nil
    with_env("TUTOR_SHARED_SECRET" => "supersecret") do
      with_picker(StubPicker) do
        post "/tutor/next_round",
          params: @valid_request,
          headers: { "Authorization" => "Bearer supersecret" },
          as: :json
      end
    end
    assert_response :ok
  end

  test "auth: when TUTOR_SHARED_SECRET is unset, no bearer required" do
    StubPicker.reply = @canned_response
    StubPicker.raise_with = nil
    with_env("TUTOR_SHARED_SECRET" => nil) do
      with_picker(StubPicker) do
        post "/tutor/next_round", params: @valid_request, as: :json
      end
    end
    assert_response :ok
  end

  private

  def with_picker(stub)
    original = TutorController.picker
    TutorController.picker = stub
    yield
  ensure
    TutorController.picker = original
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
