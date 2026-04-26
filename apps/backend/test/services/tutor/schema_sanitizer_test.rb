require "test_helper"

class Tutor::SchemaSanitizerTest < ActiveSupport::TestCase
  test "drops minimum/maximum on numbers" do
    schema = { type: "integer", minimum: 0, maximum: 100 }
    assert_equal({ type: "integer" }, Tutor::SchemaSanitizer.call(schema))
  end

  test "drops minLength/maxLength/pattern on strings" do
    schema = { type: "string", minLength: 1, maxLength: 50, pattern: "^[a-z]+$" }
    assert_equal({ type: "string" }, Tutor::SchemaSanitizer.call(schema))
  end

  test "drops minItems/maxItems/uniqueItems on arrays" do
    schema = { type: "array", items: { type: "integer", minimum: 0 }, minItems: 1, maxItems: 5, uniqueItems: true }
    assert_equal({ type: "array", items: { type: "integer" } }, Tutor::SchemaSanitizer.call(schema))
  end

  test "preserves structural keywords (type, properties, required, enum, oneOf)" do
    schema = {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["a", "b"] },
        size: { type: "integer", minimum: 0 },
      },
      required: ["kind", "size"],
      additionalProperties: false,
    }
    expected = {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["a", "b"] },
        size: { type: "integer" },
      },
      required: ["kind", "size"],
      additionalProperties: false,
    }
    assert_equal expected, Tutor::SchemaSanitizer.call(schema)
  end

  test "handles string keys equivalently to symbol keys" do
    schema = { "type" => "integer", "minimum" => 0 }
    assert_equal({ "type" => "integer" }, Tutor::SchemaSanitizer.call(schema))
  end

  test "is non-destructive: original input is unchanged" do
    schema = { type: "integer", minimum: 0 }
    Tutor::SchemaSanitizer.call(schema)
    assert_equal({ type: "integer", minimum: 0 }, schema)
  end
end
