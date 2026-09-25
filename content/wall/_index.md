---
title: "my inner monologue"
description: "what i want to say to all my friends - everyone, really"
# HTML only: no feed for the wall.
outputs: ["html"]
# The cascade also lands on this page, so the section re-enables its own
# rendering: /wall/ is the only page the wall has.
build:
  render: always
  list: local
cascade:
  build:
    render: never
    list: local
---
