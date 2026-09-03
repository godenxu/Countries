# 重新构建

```
npm i world-atlas@2 world-countries country-json earcut
node build/01-geometry.mjs   # 疆域拓扑 -> data/geo.bin
node build/02-countries.mjs  # 国家资料 -> data/countries.json
node build/03-bundle.mjs     # 打包 -> dist/index.html + release/*.zip
```

构建版本 20260903181556（UTC+8）。
