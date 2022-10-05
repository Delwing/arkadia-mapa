/**
 * Process uploaded file
 */

 const {argv} = require('process')

  const { MudletMapReader } = require("mudlet-map-binary-reader")
 
 const revision = require('child_process').execSync('git rev-parse HEAD').toString()
 const file = "map_master3.dat"
 
 const map = MudletMapReader.read(file)
 map.mUserData.revision = revision.trim()
 if (argv[2]) {
    map.mUserData.version = argv[2]
 }
 MudletMapReader.write(map, file)
