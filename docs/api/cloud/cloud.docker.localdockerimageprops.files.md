---
id: cloud.docker.localdockerimageprops.files
title: docker.LocalDockerImageProps.files property
hide_title: true
---
<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[API Reference](../index.md) &gt; [Adapt Cloud](./index.md) &gt; [@adpt/cloud](./cloud.md) &gt; [docker](./cloud.docker.md) &gt; [LocalDockerImageProps](./cloud.docker.localdockerimageprops.md) &gt; [files](./cloud.docker.localdockerimageprops.files.md)

## docker.LocalDockerImageProps.files property

Extra files that should be included during the docker build

<b>Signature:</b>

```typescript
files?: File[];
```

## Remarks

LocalDockerImage uses a multi-stage build process. It first creates a stage that includes the files specified in this field. These files are then available to the `dockerfile` to copy into the final image.