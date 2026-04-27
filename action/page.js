const { MudletMapReader } = require("mudlet-map-binary-reader");
const fs = require("fs");

const inputFile = "map_master3.dat"
const outputDirectory = "page/data"

let mapModel = MudletMapReader.read(inputFile);

let { mapData, colors } = MudletMapReader.export(mapModel);

fs.writeFileSync(`${outputDirectory}/mapExport.js`, `mapData = ${JSON.stringify(mapData)}`);
fs.writeFileSync(`${outputDirectory}/mapExport.json`, JSON.stringify(mapData));
fs.writeFileSync(`${outputDirectory}/colors.js`, `colors = ${JSON.stringify(colors)}`);
fs.writeFileSync(`${outputDirectory}/colors.json`, JSON.stringify(colors));
