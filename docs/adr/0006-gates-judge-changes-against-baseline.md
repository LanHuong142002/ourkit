# Gates judge only what changed since the Baseline

When the kit is installed into a Brownfield project, the state of the code at that moment is recorded as the Baseline; every Gate applies standards only to code changed since the Baseline and doesn't require old code to meet new standards. Reason: if the first Review on an old project reported hundreds of existing errors, the user would drop the kit immediately; new standards spread gradually through the places that get edited.
