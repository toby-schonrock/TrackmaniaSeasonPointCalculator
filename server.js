const { error, log } = require('console');
const express = require('express')
const port = process.env.PORT || 3000;


const app = express();
const dir = __dirname + '\\public';

const http = require('http');
const { exit } = require('process');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

function logError(msg) {
    console.log(`\x1b[31m${msg}\x1b[0m`);
}

function logSucces(msg) {
    console.log(`\x1b[32m${msg}\x1b[0m`);
}

function logInfo(msg) {
    console.log(`\x1b[34m${msg}\x1b[0m`);
}

async function ValidateResponse(response, request, kill = false) {
    if (response.ok) {
        // console.log(`${request} recieved`);
        return true;
    } else {
        logError(`${request} not recieved`);
        console.log(response.status);
        console.log(response.statusText);
        console.log(await response.json());
        if (kill) throw new Error();
        return false;
    }
}

class AsyncCachedDict {
    getNew;
    name = "";
    dict = {};

    constructor(name, getNew) {
        this.name = name;
        this.getNew = getNew;
    }

    async get(key) {
        if (key in this.dict) {
            logInfo(`${this.dict[key].name} found in ${this.name}`);
            return { ok: true, obj: this.dict[key] };
        }
        let temp = await this.getNew(key);
        if (temp.ok) {
            this.dict[key] = temp.obj;
            logInfo(`${temp.obj.name} added to ${this.name}`);
            return { ok: true, obj: temp.obj };
        }
        return { ok: false, obj: {} }
    }
}

class Track {
    number = 0;
    id = "";
    uid = "";
    name = "";

    constructor(number, id, uid, name) {
        this.number = number;
        this.id = id;
        this.uid = uid;
        this.name = name;
    }
}

class Campaign {
    id = "";
    name = "";
    tracks = [];

    constructor(id, name, tracks = []) {
        this.id = id;
        this.name = name;
        this.tracks = tracks;
    }
}

class Player {
    id = "";
    name = "";
    timeStamp = "";

    constructor(id, name = "", timeStamp = "") {
        this.id = id;
        this.name = name;
        this.timeStamp = timeStamp;
    }
}

class Token {
    token = "";
    refreshToken = "";

    constructor(token, refreshToken) {
        this.token = token;
        this.refreshToken = refreshToken;
    }
}

class Api {
    servicesToken = new Token("", "");
    liveServicesToken = new Token("", "");

    campaigns = new AsyncCachedDict("campaign dict", this.getCampaign.bind(this));
    players = new AsyncCachedDict("player dict", this.getPlayer.bind(this));
    playerCache = {};

    async connect(credentials, userAgent) {
        let basic = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
        let ticket = await this.getTicket(basic, userAgent);
        this.servicesToken = await this.getToken(ticket, "NadeoServices")
        this.liveServicesToken = await this.getToken(ticket, "NadeoLiveServices")
        console.log("Connected to nadeo");
    }

    async getTicket(basic, userAgent) {
        let response = await fetch("https://public-ubiservices.ubi.com/v3/profiles/sessions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Ubi-AppId": "86263886-327a-4328-ac69-527f0d20a237",
                "Authorization": basic,
                "User-Agent": userAgent
            }
        })
        ValidateResponse(response, `ticket`, true);
        return (await response.json()).ticket;
    }

    async getToken(ticket, audience) {
        let response = await fetch("https://prod.trackmania.core.nadeo.online/v2/authentication/token/ubiservices", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `ubi_v1 t=${ticket}`
            },
            body: JSON.stringify({ audience: audience })
        })
        ValidateResponse(response, `${audience} tokens`, true);
        let token = await response.json();
        return new Token(token.accessToken, token.refreshToken);
    }

    async refreshToken(live) {
        logInfo(`${live ? "LiveServices" : "Services"}Token refreshed`);
        response = await fetch("https://prod.trackmania.core.nadeo.online/v2/authentication/token/refresh", {
            method: "POST",
            headers: {
                Authorization: `nadeo_v1 t=${(live ? this.liveServicesToken : this.servicesToken).refreshToken}`
            }
        })
        ValidateResponse(response, `token refresh`, true);
        let token = await response.json();
        if (live) this.liveServicesToken = new Token(token.accessToken, token.refreshToken);
        else this.servicesToken = new Token(token.accessToken, token.refreshToken);
    }

    async safeApiCall(url, data, live, label) {
        if (this.servicesToken.token === "" || this.liveServicesToken.token === "") {
            throw new Error("need to call this.connect() before making fetch calls");
        }
        if (!("method" in data)) {
            throw new Error("invalid fetch call");
        }
        if (!("headers" in data)) data.headers = {};
        data.headers["Authorization"] = `nadeo_v1 t=${(live ? this.liveServicesToken : this.servicesToken).token}`;
        let response = await fetch(url, data);
        if (response.status === 401) { // token out of date
            console.log(await response.json()); // TODO remove
            await this.refreshToken(live);
            data.headers["Authorization"] = `nadeo_v1 t=${(live ? this.liveServicesToken : this.servicesToken).token}`;
            response = await fetch(url, data);
        }
        if (response.ok) {
            // console.log(`${label} recieved`);
            return { ok: true, data: await response.json() };
        } else {
            logError(`${label} not recieved`);
            logError(`status - ${response.status}`);
            logError(`statusText - ${response.statusText}`);
            console.log(await response.json());
            return { ok: false, data: {} };
        }
    }

    async getPlayer(accountId) {
        let response = await this.safeApiCall(`https://prod.trackmania.core.nadeo.online/accounts/displayNames/?accountIdList=${accountId}`,
            { method: "GET" }, false, `player ${accountId}`);

        if (!response.ok || response.data.length !== 1) {
            return { ok: false, obj: {} }; // couldn't retrieve
        }
        return { ok: true, obj: new Player(accountId, response.data[0].displayName, response.data[0].timestamp) };
    }

    async getCampaign(count) {
        let response = await this.safeApiCall(`https://live-services.trackmania.nadeo.live/api/token/campaign/official?offset=${count}&length=1`,
            { method: "GET" }, true, `campaign ${count}`);
        if (!response.ok) return { ok: false, obj: {} };
        let playlist = response.data.campaignList[0].playlist;
        let campaign = new Campaign(response.data.campaignList[0].id, response.data.campaignList[0].name);
        let uids = [];
        for (const map of playlist) {
            campaign.tracks.push(new Track(map.position + 1, "", map.mapUid));
            uids.push(map.mapUid);
        }

        // map id call
        response = await this.safeApiCall(
            `https://prod.trackmania.core.nadeo.online/maps/?mapUidList=${uids.join(",")}`,
            { method: "GET" }, false, "maps"
        );
        if (!response.ok) return { ok: false, obj: {} };
        for (const map of response.data) {
            for (const track of campaign.tracks) {
                if (track.uid === map.mapUid) {
                    track.id = map.mapId;
                    track.name = map.name;
                }
            }
        }
        return { ok: true, obj: campaign };
    }

    async getCampaignRankings(campaignCount, accountId) {
        let pkg = {
            status: { ok: false, message: "" },
            player: {},
            campaign: {}
        }

        let lookup = await this.players.get(accountId);
        if (!lookup.ok) {
            pkg.status.message = "Couldn't retrieve player";
            return pkg;
        }
        pkg.player = lookup.obj;

        // fetch campaign call
        lookup = await this.campaigns.get(campaignCount);
        if (!lookup.ok) {
            pkg.status.message = "Couldn't retrieve campaign";
            return pkg;
        }
        pkg.campaign = lookup.obj;

        // record call
        let mapIdList = []
        for (const track of pkg.campaign.tracks) { mapIdList.push(track.id); }
        let response = await this.safeApiCall(
            `https://prod.trackmania.core.nadeo.online/mapRecords/?accountIdList=${accountId}&mapIdList=${mapIdList.join(",")}`,
            { method: "GET" }, false, `records`
        );
        if (!response.ok) {
            pkg.status.message = "Couldn't retrieve records";
            return pkg;
        }
        for (const record of response.data) {
            for (const track of pkg.campaign.tracks) {
                if (track.id === record.mapId) {
                    track.time = record.recordScore.time;
                }
            }
        }

        // ranking call
        let scores = [];
        let body = { "maps": [] };
        for (const track of pkg.campaign.tracks) {
            scores.push(`scores[${track.uid}]=${track.time}`);
            body.maps.push({ "mapUid": track.uid, "groupUid": "Personal_Best" })
        }
        response = await this.safeApiCall(
            `https://live-services.trackmania.nadeo.live/api/token/leaderboard/group/map?${scores.join("&")}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        },
            true, "rankings"
        );
        if (!response.ok) {
            pkg.status.message = "Couldn't retrieve rankings";
            return pkg;
        }
        for (const rank of response.data) {
            for (const track of pkg.campaign.tracks) {
                if (track.uid === rank.mapUid && rank.zones[0].zoneName === "World") {
                    track.rank = rank.zones[0].ranking.position;
                    if (track.rank < 20000) --track.rank;
                }
            }
        }
        logSucces(`Rankings retrieved for ${pkg.player.name}`)
        pkg.status = { ok: true, message: "Rankings retrieved" };
        return pkg;
    }
};

let nadeo = new Api();
const userAgent = "TrackmaniaSeasonPointCalculator / tobias@schonrocks.com";

const fs = require('fs');
let credentials;
try {
    let raw = fs.readFileSync('creds.json', 'utf8');
    credentials = JSON.parse(raw);
    if (!("username" in credentials && "password" in credentials)) throw new Error("credentials file invalid")
} catch (e) {
    console.log('Error:', e.stack);
}

nadeo.connect(credentials, userAgent);

app.get('/', (req, res) => {
    res.sendFile(dir.concat('\\views\\index.html'));
});

app.use(express.static('public'));

server.listen(port, () => {
    console.log("listening on %s", port);
})

io.on('connection', (socket) => {
    console.log(`User connected from socket ${socket.id} `);
    socket.on('RankingRequest', async (accountId) => {
        // console.log(`Ranking request id - ${accountId} `);
        socket.emit("RankingResponse", await nadeo.getCampaignRankings(0, accountId));
    });
});