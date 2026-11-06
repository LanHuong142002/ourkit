# Deploying to production always needs a person

The agent may deploy to staging by itself, but never deploys to production by itself, even in a Loop Run. The Deploy Stage (a frame in v1, filled in Release 2) reads the `deploy` and `smoke` commands from the Stack Profile, so Core still assumes no infrastructure. Reason: production is where errors reach real users, and in the same spirit as ADR 0009, merging is already a person's job, and so is deploying to production.
