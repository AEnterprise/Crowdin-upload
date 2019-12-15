const core = require('@actions/core');
const fs = require('fs');
const request = require('request');

const walkSync = function (dir) {
    let files = fs.readdirSync(dir);
    let filelist = {};
    files.forEach(function (file) {
        if (fs.statSync(dir + file).isDirectory()) {
            filelist[file] = walkSync(dir + file + '/');
        } else {
            filelist[file] = dir + file; // no folder
        }
    });
    return filelist;
};


try {

    //get crowdin info from github
    const crowdin_username = core.getInput("crowdin_username");
    const crowdin_api_key = core.getInput("crowdin_api_key");
    const crowdin_project_identifier = core.getInput("crowdin_project_identifier");

    const post = function (endpoint, data, handler, extra) {
        request.post(`https://api.crowdin.com/api/project/${crowdin_project_identifier}/${endpoint}?login=${crowdin_username}&account-key=${crowdin_api_key}&json${extra ? extra : ""}`,
            data,
            (e, res, body) => {
                if (e)
                    core.setFailed(e.message);

                console.log(`statuscode: ${res.statusCode}`);

                if (handler)
                    handler(JSON.parse(body))
            });
    };

    const upload = function (endpoint, filename, data, handler) {
        let req = request.post(`https://api.crowdin.com/api/project/${crowdin_project_identifier}/${endpoint}?login=${crowdin_username}&account-key=${crowdin_api_key}&json}`,
            data,
            (e, res, body) => {
                if (e)
                    core.setFailed(e.message);

                console.log(`statuscode: ${res.statusCode}`);

                if (handler)
                    handler(JSON.parse(body))
            });
        req.form().append("file", fs.createReadStream(filename));
    };


    //get project info
    post("info", {}, data => {
        // we're only interested in the files
        const files = data.files;

        //find the docs folder
        let folder = undefined;

        // we only want our docs folder
        for (let i = 0; i < files.length; i++) {
            if (files[i].id === "181") {
                folder = files[i].files;
                break;
            }
        }

        if (!folder)
            core.setFailed("Unable to locate docs folder to sync to on crowdin!");

        //walk the crowdin response and create file tree

        const walk = function (dirname, files_in) {
            const tree = {};
            for (let i = 0; i < files_in.length; i++) {
                const {node_type, name, files} = files_in[i];
                if (node_type === "directory")
                    tree[name] = walk(`${dirname}/${name}/`, files);
                else
                    tree[name] = dirname + name;
            }
            return tree;
        };

        console.log(folder);
        const crowdin_tree = walk("", folder);
        console.log(crowdin_tree);

        //loop over local tree and sync/create as needed
        const sync = function (localTree, crowdinTree) {
            for (let i in localTree) {
                // is this a dir or a file?
                if (typeof localTree[i] !== "string") {
                    // tree, does it exist online?
                    if (crowdinTree[i]!== "string") {
                        // yes, sync it
                        sync(localTree[i], crowdinTree[i]);
                    } else {
                        //nope, create and sync it
                        post("add-directory", {}, data => sync(localTree[i], []), `&name=${i}`);
                        sync(localTree[i], {});
                    }
                } else {
                    // we are a file, check if it exists online
                    if (crowdinTree.hasOwnProperty(i)) {
                        //it does, sync it
                        upload("update-file", localTree[i], {})
                    } else {
                        //it doesn't, create it
                        upload("add-file", localTree[i], {})
                    }
                }
            }
        };

        const localTree = walkSync(core.getInput("dir"));
        console.log(localTree)
        sync(localTree, crowdin_tree);


    })


} catch (error) {
    core.setFailed(error.message);
}
