const core = require('@actions/core');
const fs = require('fs');
const request = require('request');
resolve = require('path').resolve;

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
        request.post({
            url: `https://api.crowdin.com/api/project/${crowdin_project_identifier}/${endpoint}?login=${crowdin_username}&account-key=${crowdin_api_key}&json${extra ? extra : ""}`,
            formData: data
            },
            (e, res, body) => {
                if (e)
                    core.setFailed(e.message);

                if (res.statusCode != 200) {
                    console.log(endpoint)
                    console.log(data)
                    core.setFailed("failed request")
                }

                if (handler)
                    handler(JSON.parse(body))
            });
    };

    const upload = function (endpoint, data, handler) {
        let req = request.post({
                url: `https://api.crowdin.com/api/project/${crowdin_project_identifier}/${endpoint}?login=${crowdin_username}&account-key=${crowdin_api_key}&json}`,
                formData: data
            },
            (e, res, body) => {
                if (e)
                    core.setFailed(e.message);

                console.log(`statuscode: ${res.statusCode}`);
                if (res.statusCode != 200)
                    core.setFailed("failed request")


                if (handler)
                    handler(JSON.parse(body))
            });
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

        const crowdin_tree = walk("", folder);

        //loop over local tree and sync/create as needed
        const sync = function (localTree, crowdinTree) {
            for (let i in localTree) {
                // is this a dir or a file?
                if (typeof localTree[i] === "object") {
                    // tree, does it exist online?
                    if (crowdinTree[i]) {
                        // yes, sync it
                        sync(localTree[i], crowdinTree[i]);
                    } else {
                        //nope, create and sync it
                        post("add-directory", {}, data => sync(localTree[i], []), `&name=docs/${i}`);
                        sync(localTree[i], {});
                    }
                } else {
                    // we are a file, check if it exists online
                    if (crowdinTree.hasOwnProperty(i)) {
                        //it does, sync it
                        const data = {};
                        const f = localTree[i].split("/").filter((value, index) => index > 0).join("/");
                        data[`files[docs/${f}]`] = fs.createReadStream(resolve(localTree[i]));
                        data[`export_patterns[docs/${f}]`] = "/%original_path%/%file_name%.%locale%.%file_extension%";
                        upload("update-file", data)
                    } else {
                        //it doesn't, create it
                        const data = {};
                        const f = localTree[i].split("/").filter((value, index) => index > 0).join("/");
                        data[`files[docs/${f}]`] = fs.createReadStream(resolve(localTree[i]));
                        data[`export_patterns[docs/${f}]`] = "/%original_path%/%file_name%.%locale%.%file_extension%";
                        upload("add-file", data)
                    }
                }
            }
        };

        const localTree = walkSync(core.getInput("dir"));
        sync(localTree, crowdin_tree);

        const cleanup = function (localTree, crowdin_tree, prefix) {
            for (let i in crowdin_tree) {
                //does this exist locally?
                if (!localTree[i]) {
                    // is this a dir or a file?
                    if (typeof crowdin_tree[i] === "object") {
                        //yup, bye bye
                        post("delete-directory", {}, ()=> {}, `&name=${prefix}/${i}`)
                    } else {
                        //nope, but it still goes the way of the dodo
                        post("delete-file", {
                            file: `docs/${crowdin_tree[i]}`.replace("//", "/")
                        })
                    }
                    //it does, does it have subobjects to clean?
                } else if (typeof crowdin_tree[i] === "object") {
                    cleanup(localTree[i], crowdin_tree[i], `${prefix}/${i}`)
                }
            }
        }

        cleanup(localTree, crowdin_tree, "docs");


    })


} catch (error) {
    core.setFailed(error.message);
}
