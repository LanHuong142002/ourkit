# A change touching a Sensitive Area is always at least a Feature

The agent proposes a Tier and the user confirms it, but there is a hard floor: any change touching auth or permissions, data, schema, money or public API is at least a Feature, even for a single line, and the user cannot lower it to Patch. Reason: these are exactly the places where a "forgot to consider that" mistake has the largest consequences, and also where the feeling of "it's only a small fix" appears most often.
