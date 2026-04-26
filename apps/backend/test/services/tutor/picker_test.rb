require "test_helper"
require "json"

class Tutor::PickerTest < ActiveSupport::TestCase
  setup do
    @valid_request = JSON.parse(file_fixture("valid_request.json").read)
    @canned_llm_response = JSON.parse(file_fixture("llm_response_skip_count_2.json").read)
  end

  class StubClient
    attr_reader :captured

    def initialize(reply:)
      @reply = reply
      @captured = nil
    end

    def chat(model:, messages:, response_schema:)
      @captured = { model:, messages:, response_schema: }
      { content: @reply }
    end
  end

  test "happy path: returns the LLM response shape" do
    client = StubClient.new(reply: @canned_llm_response)
    result = Tutor::Picker.call(@valid_request, client: client)

    assert_equal "skip_count_2", result.fetch("skillId")
    assert_equal "spell-cast",   result.fetch("pluginId")
    assert_equal [2, 4, 6, 8, 10], result.dig("params", "sequence")
  end

  test "passes the configured model name to the client" do
    client = StubClient.new(reply: @canned_llm_response)
    Tutor::Picker.call(@valid_request, client: client, model: "claude-sonnet-4-6")
    assert_equal "claude-sonnet-4-6", client.captured.fetch(:model)
  end

  test "builds a response schema that constrains skillId to the eligible pool" do
    client = StubClient.new(reply: @canned_llm_response)
    Tutor::Picker.call(@valid_request, client: client)
    skill_enum = client.captured.dig(:response_schema, :properties, :skillId, :enum)
    assert_equal ["skip_count_2", "add_within_5"], skill_enum
  end

  test "builds a response schema that constrains pluginId to available plugins" do
    client = StubClient.new(reply: @canned_llm_response)
    Tutor::Picker.call(@valid_request, client: client)
    plugin_enum = client.captured.dig(:response_schema, :properties, :pluginId, :enum)
    assert_equal ["spell-cast"], plugin_enum
  end

  test "rejects LLM response whose skillId is not in the eligible pool" do
    bad = @canned_llm_response.merge("skillId" => "make_10")
    client = StubClient.new(reply: bad)
    assert_raises(Tutor::Picker::InvalidResponse) do
      Tutor::Picker.call(@valid_request, client: client)
    end
  end

  test "rejects LLM response whose pluginId is not available" do
    bad = @canned_llm_response.merge("pluginId" => "block-tower")
    client = StubClient.new(reply: bad)
    assert_raises(Tutor::Picker::InvalidResponse) do
      Tutor::Picker.call(@valid_request, client: client)
    end
  end

  test "rejects LLM response whose chosen plugin doesn't support the chosen skill" do
    bad = @canned_llm_response.merge("skillId" => "add_within_5")
    client = StubClient.new(reply: bad)
    assert_raises(Tutor::Picker::InvalidResponse) do
      Tutor::Picker.call(@valid_request, client: client)
    end
  end

  test "rejects LLM response whose params don't match the plugin's paramSchema" do
    bad = @canned_llm_response.deep_dup
    bad["params"]["enemyType"] = "dragon"
    client = StubClient.new(reply: bad)
    assert_raises(Tutor::Picker::InvalidResponse) do
      Tutor::Picker.call(@valid_request, client: client)
    end
  end

  test "raises if no plugin in availablePlugins overlaps the eligible pool" do
    req = @valid_request.deep_dup
    req["availablePlugins"][0]["supportedSkills"] = ["place_value_tens"]
    client = StubClient.new(reply: @canned_llm_response)
    assert_raises(Tutor::Picker::NoEligibleContent) do
      Tutor::Picker.call(req, client: client)
    end
  end

  test "raises on empty eligible pool" do
    req = @valid_request.deep_dup
    req["eligiblePool"] = []
    client = StubClient.new(reply: @canned_llm_response)
    assert_raises(Tutor::Picker::NoEligibleContent) do
      Tutor::Picker.call(req, client: client)
    end
  end
end
