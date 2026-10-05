---
title: "my inner monologue"
description: "what i want to say to all my friends (everyone, really)"
# HTML only: no feed for the wall.
outputs: ["html"]
# Each post also renders alone at /wall/<slug>/. `list: local` keeps the posts
# (and, since the cascade lands here too, this page) out of the sitemap and
# every page list outside the wall.
cascade:
  build:
    list: local
---
