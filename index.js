const core = require('@actions/core');
const fs = require('fs');
const https = require('https');

const walkSync = function (dir, filelist, addDir) {
    files = fs.readdirSync(dir);
    filelist = filelist || [];
    files.forEach(function (file) {
        if (fs.statSync(dir + file).isDirectory()) {
            filelist = walkSync(dir + file + '/', filelist);
        } else {
            filelist.push(`${addDir ? dir : ""}${file}`);
        }
    });
    return filelist;
};



try {
    const localFiles = walkSync(core.getInput("dir"));

    const crowdin_username = core.getInput("crowdin_username");
    const crowdin_api_key = core.getInput("crowdin_api_key");
    const crowdin_project_identifier = core.getInput("crowdin_project_identifier");

    const post = function (endpoint, handler) {
        const options = {
            hostname: "api.crowdin.com",
            port: 443,
            path: `/api/project/${crowdin_project_identifier}/${endpoint}?login=${crowdin_username}&account-key=${crowdin_api_key}&json`,
            method: "POST"
        };
        const req = https.request(options, res => {
            console.log(`statuscode: ${res.statusCode}`);
            res.setEncoding('utf8');

            res.on('data', data => {
                console.log(data);
                handler(JSON.parse(data))
            })

        });
        req.on("error", e=> core.setFailed(e.message));
        req.end();
    };

    post("info", console.log)




} catch (error) {
    core.setFailed(error.message);
}
