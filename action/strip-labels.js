const { MudletMapReader } = require("mudlet-map-binary-reader")

const inputFile = "map_master3.dat"
const outputFile = "map_master3_no_labels.dat"

const map = MudletMapReader.read(inputFile)

map.labels = {}

for (const areaId in map.areas) {
    const userData = map.areas[areaId].userData
    for (const key of Object.keys(userData)) {
        if (/^system\.label(Font|OutlineColor)_\d+$/.test(key)) {
            delete userData[key]
        }
    }
}

MudletMapReader.write(map, outputFile)
