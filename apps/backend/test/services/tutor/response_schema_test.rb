require "test_helper"

class Tutor::ResponseSchemaTest < ActiveSupport::TestCase
  def payload
    {
      "eligiblePool" => [{ "skillId" => "skip_count_2" }, { "skillId" => "add_within_10" }],
      "availablePlugins" => [
        { "id" => "spell-cast",  "paramSchema" => { "type" => "object" } },
        { "id" => "block-tower", "paramSchema" => { "type" => "object" } },
      ],
    }
  end

  test "constrains skillId and pluginId to enums of the eligible/available ids" do
    s = Tutor::ResponseSchema.build(payload)
    assert_equal %w[skip_count_2 add_within_10], s[:properties][:skillId][:enum]
    assert_equal %w[spell-cast block-tower], s[:properties][:pluginId][:enum]
  end

  # Regression: a `{ oneOf: [...] }` params union 400'd Anthropic's structured
  # output every call. params must be a plain string the model fills (parsed +
  # re-validated server-side), never a combinator.
  test "params is a JSON string and the schema never contains a oneOf union" do
    s = Tutor::ResponseSchema.build(payload)
    assert_equal "string", s[:properties][:params][:type]
    refute_includes s.to_s, "oneOf"
    refute_includes s.to_s, "anyOf"
  end

  test "envelope is Anthropic-strict-compatible (additionalProperties false, all required)" do
    s = Tutor::ResponseSchema.build(payload)
    assert_equal false, s[:additionalProperties]
    assert_equal %w[skillId pluginId params], s[:required]
  end

  test "stays a oneOf-free string even with a single plugin" do
    single = payload.merge("availablePlugins" => [payload["availablePlugins"].first])
    s = Tutor::ResponseSchema.build(single)
    assert_equal "string", s[:properties][:params][:type]
    refute_includes s.to_s, "oneOf"
  end
end
