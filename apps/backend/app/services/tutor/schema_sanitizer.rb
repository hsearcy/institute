module Tutor
  # Strip JSON Schema keywords that Anthropic's structured-output subset
  # rejects (e.g. `minimum` on integers, `minLength` on strings, etc.).
  #
  # We only send the sanitized schema to the LLM; the original schema is
  # still used for post-validation of the response, so a kid-app plugin can
  # define tighter constraints than the LLM is told about and we'll catch
  # violations server-side.
  module SchemaSanitizer
    # Validation keywords we drop. Structural keywords (type, properties,
    # required, items, enum, oneOf/anyOf/allOf, additionalProperties,
    # description) are kept. If Anthropic later supports more, just remove
    # entries from this set.
    UNSUPPORTED = %w[
      minimum maximum exclusiveMinimum exclusiveMaximum multipleOf
      minLength maxLength pattern format
      minItems maxItems uniqueItems
      minProperties maxProperties
      default examples
    ].freeze

    def self.call(node)
      case node
      when Hash
        cleaned = {}
        node.each do |key, value|
          k = key.to_s
          next if UNSUPPORTED.include?(k)
          cleaned[key] = call(value)
        end
        cleaned
      when Array
        node.map { |item| call(item) }
      else
        node
      end
    end
  end
end
