module Tutor
  # Strip JSON Schema keywords that Anthropic's structured-output subset
  # rejects, so we can never 400 the LLM with an unsupported schema.
  #
  # We only send the sanitized schema to the LLM; the original schema is
  # still used for post-validation of the response, so a kid-app plugin can
  # define tighter constraints than the LLM is told about and we'll catch
  # violations server-side.
  module SchemaSanitizer
    # Keywords we drop. Two groups:
    #  - validation keywords Anthropic ignores/rejects (minimum, pattern, …)
    #  - combinator/reference keywords Anthropic's structured output REJECTS
    #    (oneOf/anyOf/allOf/not, $ref/$schema/$defs/definitions). These were the
    #    source of the recurring 400s. Dropping a combinator leaves the node as a
    #    permissive schema, which Anthropic accepts; correctness is still enforced
    #    by post-validation against the real schema.
    # Kept structural keywords: type, properties, required, items, enum,
    # additionalProperties, description.
    UNSUPPORTED = %w[
      minimum maximum exclusiveMinimum exclusiveMaximum multipleOf
      minLength maxLength pattern format
      minItems maxItems uniqueItems
      minProperties maxProperties
      default examples
      oneOf anyOf allOf not
      $ref $schema $defs definitions
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
