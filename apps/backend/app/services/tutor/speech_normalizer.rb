module Tutor
  module SpeechNormalizer
    NUMBER_WORDS = {
      "zero" => 0, "one" => 1, "two" => 2, "three" => 3, "four" => 4,
      "five" => 5, "six" => 6, "seven" => 7, "eight" => 8, "nine" => 9,
      "ten" => 10, "eleven" => 11, "twelve" => 12, "thirteen" => 13,
      "fourteen" => 14, "fifteen" => 15, "sixteen" => 16, "seventeen" => 17,
      "eighteen" => 18, "nineteen" => 19, "twenty" => 20,
      "thirty" => 30, "forty" => 40, "fifty" => 50, "sixty" => 60,
      "seventy" => 70, "eighty" => 80, "ninety" => 90, "hundred" => 100,
    }.freeze

    TODDLER_ISMS = {
      "free" => "three", "tree" => "three", "twee" => "three", "fwee" => "three",
      "fife" => "five", "fwive" => "five",
      "tin" => "ten",
      "noyne" => "nine",
    }.freeze

    def self.call(transcript, expected_answers)
      n = parse(transcript)
      return { transcript: transcript, normalized: nil, confidence: "no_match" } if n.nil?
      conf = expected_answers.include?(n) ? "high" : "low"
      { transcript: transcript, normalized: n, confidence: conf }
    end

    def self.parse(raw)
      return nil if raw.nil?
      cleaned = raw.downcase.gsub(/[^a-z0-9\s]/, " ").squeeze(" ").strip
      return nil if cleaned.empty?

      tokens = cleaned.split(" ").map { |t| TODDLER_ISMS.fetch(t, t) }

      tokens.each do |t|
        return Integer(t) if t.match?(/\A\d+\z/)
      end

      sum = 0; current = 0; found = false
      tokens.each do |t|
        if (n = NUMBER_WORDS[t])
          found = true
          if n == 100
            current = (current.zero? ? 1 : current) * 100
          else
            current += n
          end
        elsif found && current > 0
          sum += current; current = 0; found = false
        end
      end
      sum += current
      found || sum > 0 ? sum : nil
    end
  end
end
