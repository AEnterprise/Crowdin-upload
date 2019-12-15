const core = require('@actions/core');
const fs = require('fs');

var walkSync = function (dir, filelist) {
    files = fs.readdirSync(dir);
    filelist = filelist || [];
    files.forEach(function (file) {
        if (fs.statSync(dir + file).isDirectory()) {
            filelist = walkSync(dir + file + '/', filelist);
        } else {
            filelist.push(file);
        }
    });
    return filelist;
};

try {
    console.log(walkSync(core.getInput("dir")))
} catch (error) {
    core.setFailed(error.message);
}
