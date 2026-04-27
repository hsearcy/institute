require "test_helper"
require "yaml"

class Tutor::SpeechNormalizerTest < ActiveSupport::TestCase
  cases = YAML.load_file(Rails.root.join("test/fixtures/files/speech_normalizer_cases.yml"))

  cases.each do |group, rows|
    rows.each_with_index do |(transcript, expected_answers, expected_normalized, expected_confidence), i|
      test "#{group} ##{i}: '#{transcript}' with #{expected_answers.inspect}" do
        result = Tutor::SpeechNormalizer.call(transcript, expected_answers)
        if expected_normalized.nil?
          assert_nil result[:normalized],
            "expected normalized=nil, got #{result.inspect}"
        else
          assert_equal expected_normalized, result[:normalized],
            "expected normalized=#{expected_normalized.inspect}, got #{result.inspect}"
        end
        assert_equal expected_confidence, result[:confidence],
          "expected confidence=#{expected_confidence}, got #{result.inspect}"
        assert_equal transcript, result[:transcript]
      end
    end
  end

  test "is callable with empty expected_answers and just classifies the number" do
    r = Tutor::SpeechNormalizer.call("five", [])
    assert_equal 5,    r[:normalized]
    assert_equal "low", r[:confidence]
  end
end
