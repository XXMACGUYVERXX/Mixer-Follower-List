(function () {

    // wrapper function for es6 Array.find()
    function find(arr, cb) {
        if (!Array.prototype.find) {
            if (!Array.isArray(arr)) {
                throw new TypeError("input is not an array");
            }
            for (var i = 0; i < arr.length; i += 1) {
                if (cb(arr[i])) {
                    return arr[i];
                }
            }
        }
        return arr.find.call(arr, cb);
    }

    // wrapper function to handle queuing multiple requests
    function request(url, callback, state) {
        var requestQueue = [], xhr;
        function nextXHR(url, callback, state) {
            callback = (callback || function(){return true});
            xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.onreadystatechange = function () {
                if (xhr.readyState == XMLHttpRequest.DONE) {
                    if (xhr.status === 429 || xhr.getResponseHeader('x-ratelimit-remaining') === "0") {
                        callback("You have been ratelimited by beam", xhr, state);

                    } else if (xhr.status === 404) {
                        callback("Channel does not exist", xhr, state);

                    } else if (xhr.status !== 200) {
                        callback("Beam reported an error: " + xhr.status, xhr, state);

                    } else if (callback(null, xhr, state) && requestQueue.length) {
                        var nextReq = requestQueue.shift();
                        nextXHR(nextReq.url, nextReq.callback, nextReq.state);
                    }
                }
            }
            xhr.send(null);
        }
        nextXHR(url, callback, state);
        function queueRequest(url, callback, state) {
            requestQueue.push({url: url, callback: callback, state: state});
            return {queue: queueRequest};
        }
        return {queue: queueRequest}
    }

    // function set to make logging to the DOM easy
    var log = (function () {
        var logEle = document.getElementById("followerlookuplog");
        function createLogMsg(msg, cls, callback, wait) {
            if (callback && typeof callback !== "function") {
                throw new TypeError("callback not a function");
            }
            var logMsg = document.createElement("div");
            logMsg.appendChild(document.createTextNode(msg));
            logMsg.className = "fadein log" + cls;
            logEle.appendChild(logMsg);

            if (callback) {
                setTimeout(function () {
                    callback(logEle);
                }, wait || 0);
            }
            return logMsg;
        }
        return {
            info: function (msg, callback, wait) {
                return createLogMsg(msg, "info", callback, wait);
            },
            error: function (msg, callback, wait) {
                return createLogMsg(msg, "error", callback, wait);
            },
            success: function (msg, callback, wait) {
                return createLogMsg(msg, "success", callback, wait);
            },
        };
    }());


    function getChanFromURI(callback) {
        log.info("Retrieving channel input...");
        var chan = [];
        String(location.search).substring(1).split(/&/g).forEach(function (item, index) {
            item = item.split("=");
            chan[index] = {
              key: String(item[0]),
              value: String(decodeURIComponent(item[1] || ""))
            };
        });
        chan = find(chan, function (item) {
            if (item.key.toLowerCase() === "chan") {
                return item;
            }
        });
        if (!callback) {
            callback = function () {};
        }
        if (chan === undefined || !chan.value) {
            throw new Error("Channel input not specified");
        } else if (!/^(?:(?:\d+)|(?:[a-z][a-z\d_]+))$/i.test(chan.value)) {
            throw new Error("Channel input invalid");
        } else {
            return chan.value;
        }
    }

    function validateChannel(chan, callback) {
        log.info("Verifying the channel exists...");
        request("https://beam.pro/api/v1/channels/" + chan, function (err, xhr, state) {
            callback(err, xhr, state);
        });
    }




    // Time to begin processing
    (function () {
        try {
            var chan = getChanFromURI();
            log.info("Channel input retrieved: " + chan);
        } catch (e) {
            log.error(e.message, function () {
                location.href = "./index.html"
            }, 5000);
            throw e;
        }

        validateChannel(chan, function (err, xhr, state) {
            if (err) {
                log.error(err);
                throw new Error(err);
            }
            var res, followers = [], pageCount;
            try {
                res = JSON.parse(xhr.responseText);
            } catch (e) {
                log.error("Beam returned invalid response");
                throw new Error("Beam returned invalid response");
            }

            log.success("Channel found: " + res.user.username + " (#" + res.id + ")");

            if (xhr.getResponseHeader("x-ratelimit-remaining") !== null && xhr.getResponseHeader("x-ratelimit-remaining") <= 1) {
                log.error("You do not have a large enough beam-api rate limit buffer to continue");
                throw new Error("You do not have a large enough beam-api rate limit buffer to continue: " + xhr.getResponseHeader("x-ratelimit-remaining"));
            }
            function formatDate(date) {
                function pad(num) {
                    return (num < 10 ? "0" : "") + String(num);
                };
                var month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()];
                var day = date.getDate() + ",";
                var year = date.getFullYear();
                var hours = pad(date.getHours());
                var mins = pad(date.getMinutes());
                var secs = pad(date.getSeconds());
                return [month, day, year].join(" ") + " " + [hours, mins, secs].join(":");
            }
            function formatDuration(time) {
                time = Math.floor(time / 1000);
                var dur = [], mon, wks, days, hrs, mins;
                mon = Math.floor(time/(60*60*24*30));
                time -= mon*60*60*24*30;
                if (mon) dur.push(mon + "mths");
                wks = Math.floor(time / (60 * 60 *24 *7));
                time -= wks*60*60*24*7
                if (wks) dur.push(wks + "wks");
                days = Math.floor(time / (60*60*24));
                time -= days*60*60*24;
                if (days) dur.push(days + "days");
                hrs = Math.floor(time / (60*60));
                time -= hrs*60*60;
                if (hrs) dur.push(hrs + "hrs");
                min = Math.floor(time / 60);
                time -= min*60;
                if (min) dur.push(min + "mins");
                if (time) dur.push(time + "secs");
                return dur.join(", ");
            }
            function sortFollowerTable(item, order) {
                order = order || 1;
                var tblBody = document.getElementById("followerlookuptable").getElementsByTagName("tbody")[0];
                while (tblBody.firstChild) {
                    tblBody.removeChild(tblBody.firstChild);
                }
                followers.sort(function (a, b) {
                    var res = 0;
                    a = a[item];
                    b = b[item];
                    if (item === "name") {
                        a = a.toLowerCase();
                        b = b.toLowerCase();
                    }
                    if (a < b) res = -1;
                    if (a > b) res = 1;
                    return res * order;
                });
                followers.forEach(function (item) {
                    console.log(item);
                    tblBody.appendChild(item.row);
                });
            }

            function processFollowers(xhr, page) {
                log.info("- Processing follower page " + (page + 1) + " of " + pageCount + "...");
                var json, now;
                try {
                    json = JSON.parse(xhr.responseText);
                } catch (e) {
                    log.error("Beam returned an invalid response");
                    return false;
                }
                json.forEach(function (item) {
                    followers.push({
                        username: item.username,
                        id: item.channel.id,
                        date: (new Date(item.followed.createdAt)).getTime()
                    });
                });
                log.info("- Added " + json.length + " users to the follower list");

                if ((page + 1) == pageCount) {
                    log.info("All users added to the follower list; beginning sort");
                    if (followers.length) {
                        now = Date.now();
                        followers.forEach(function (follower, index) {
                            var name = follower.username,
                                id   = follower.id,
                                date = new Date(follower.date),
                                duration = (now - date.getTime()),
                                tblRow = document.createElement("tr"),
                                tblCell, span, dateText, durText;

                            followers[index].duration = duration;
                            followers[index].row = tblRow;

                            // Username & Id Cell
                            tblCell = document.createElement("td");
                            span = document.createElement("span");
                            span.className = "username";
                            span.appendChild(document.createTextNode(name));
                            tblCell.appendChild(span);
                            span = document.createElement("span");
                            span.className = "userid";
                            span.appendChild(document.createTextNode("(#" + id + ")"));
                            tblCell.appendChild(span);
                            tblRow.appendChild(tblCell);

                            // Date Cell
                            dateText = formatDate(date);
                            tblCell = document.createElement("td");
                            tblCell.appendChild(document.createTextNode(dateText));
                            tblRow.appendChild(tblCell);

                            // Duration Cell
                            durText = formatDuration(duration);
                            tblCell = document.createElement("td");
                            tblCell.appendChild(document.createTextNode(durText));
                            tblRow.appendChild(tblCell);
                        });
                        sortFollowerTable("date", 1);
                    }
                    document.getElementById("followerlookuplog").style.display = "none";
                    document.getElementById("followerlookuptable").style.display = "block";
                }
                return true;
            };

            log.info("Requesting page 1 of followers list");
            request("https://beam.pro/api/v1/channels/" + res.id + "/follow?limit=100&page=0", function (err, xhr) {
                if (err) {
                    log.error(err);
                    throw new Error(err);
                }
                if (xhr.getResponseHeader('x-total-count') == null) {
                    log.error("Beam failed to report total number of followers");
                    throw new Error("Beam failed to report total number of followers");
                }
                if (xhr.getResponseHeader('x-ratelimit-remaining') == null) {
                    log.error("Beam failed to report the number of requests left in your ratelimit buffer");
                    throw new Error("Beam failed to report the number of requests left in your ratelimit buffer");
                }
                pageCount = Math.ceil(xhr.getResponseHeader('x-total-count') / 100);
                if (xhr.getResponseHeader('x-ratelimit-remaining') < (pageCount - 1)) {
                    log.error("You do not have enough room in your ratelimit buffer to retrieve all follower pages; terminating lookup");
                    throw new Error("You do not have enough room in your ratelimit buffer to retrieve all follower pages");
                }
                processFollowers(xhr, 0);

                function callback(err, xhr, state) {
                    if (err) {
                        log.error(err);
                        return false;
                    }
                    log.success("Retrieved follower page " + state);
                    return processFollowers(xhr, state);
                }

                for (var pageIndex = 1, req; pageIndex < pageCount; pageIndex += 1) {
                    log.info("Queuing request for follower page: " + pageIndex);
                    if (pageIndex === 1) {
                        req = request("https://beam.pro/api/v1/channels/" + res.id + "/follow?limit=100&page=" + pageIndex, callback, pageIndex);
                    } else {
                        req.queue("https://beam.pro/api/v1/channels/" + res.id + "/follow?limit=100&page=" + pageIndex, callback, pageIndex);
                    }
                }
            });
        });
    }());
}());
