const { error } = require('console');
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

class Token {
    token = "";
    refreshToken = "";

    constructor(token, refreshToken) {
        this.token = token;
        this.refreshToken = refreshToken;
    }
}

class Track {
    number = 0;
    id = "";
    uid = "";
    time = 0;
    rank = 0;

    constructor(number, id, uid) {
        this.number = number;
        this.id = id;
        this.uid = uid;
    }
}

class Player {
    id = "";
    name = "";

    constructor(id, name = "") {
        this.id = id;
        this.name = name;
    }
}

class Api {
    servicesToken = new Token("", "");
    liveServicesToken = new Token("", "");

    campaignCache = {};
    playerCache = {};

    constructor() { }

    async connect(credentials, userAgent) {
        let basic = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
        let ticket = await this.getTicket(basic, userAgent);
        this.servicesToken = await this.getToken(ticket, "NadeoServices")
        this.liveServicesToken = await this.getToken(ticket, "NadeoLiveServices")
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
        console.log(token);
        return new Token(token.accessToken, token.refreshToken);
    }

    async refreshToken(live) {

    }

    async safeApiCall(url, data, live, label) {
        if (this.servicesToken.token == "" || this.liveServicesToken.token == "") {
            throw new Error("need to call this.connect() before making fetch calls");
        }
        if (!("method" in data)) {
            throw new Error("invalid fetch call");
        }
        if (!("headers" in data)) data.headers = {};
        data.headers["Authorization"] = `ubi_v1 t=${live ? this.liveServicesToken.token : this.servicesToken.token}`;
        let response = await fetch(url, data);
        if (response.status === 400) {
            logError("Token out of date I think");
            throw new Error();
            // refreshToken(live)
            // TODO deal with token refresh
        }
        if (response.ok) return { ok: true, data: await response.json() };
        else {
            logError(`${label} not recieved`);
            logError(`status - ${response.status}`);
            logError(`statusText - ${response.statusText}`);
            console.log(await response.json());
            return { ok: false, data: {} };
        }
    }

    async getPlayer(accountId) {
        if (accountId in this.playerCache) {
            logInfo(`player ${this.playerCache[accountId].name} found in cache`)
            return { ok: true, player: this.playerCache[accountId] };
        } else {
            let response = await this.safeApiCall(`https://prod.trackmania.core.nadeo.online/accounts/displayNames/?accountIdList=${accountId}`,
                { method: "GET" }, false, `player ${accountId}`);
            
            if (!response.ok) return { ok: false, player: {} }; // couldn't retrieve

            let player = new Player(accountId, response.data[0].displayName);
            this.playerCache[accountId] = player;
            logInfo(`player ${this.playerCache[accountId].name} added to cache`);
            return { ok: true, player: player };

        }
    }

    async getCampaignRankings(campaign, accountId) {
        let tracks = [];

        let response = await this.getPlayer(accountId);
        if (!response.ok) return {
            status: { ok: false, message: "Couldn't retrieve player" },
            player: {},
            tracks: tracks
        };
        let player = response.player;

        // fetch campaign call
        response = this.safeApiCall(
            `https://live-services.trackmania.nadeo.live/api/token/campaign/official?offset=${campaign}&length=1`,
            { method: "GET" }, true, `campaign ${campaign}`);
        if (!response.ok) return {
            status: { ok: false, message: "Couldn't retrieve campaign" },
            player: player,
            tracks: tracks
        };
        let playlist = response.data.campaignList[0].playlist;
        let uids = [];
        for (const map of playlist) {
            tracks.push(new Track(map.position + 1, "", map.mapUid));
            uids.push(map.mapUid);
        }

        // map id call
        response = this.safeApiCall(
            `https://prod.trackmania.core.nadeo.online/maps/?mapUidList=${uids.join(",")}`,
            { method: "GET" }, false, "maps"
        );
        if (!response.ok) return {
            status: { ok: false, message: "Couldn't retrieve maps" },
            player: player,
            tracks: tracks
        };
        for (const map of response.data) {
            for (const track of tracks) {
                if (track.uid === map.mapUid) {
                    track.id = map.mapId;
                }
            }
        }

        // record call
        let mapIdList = []
        for (const track of tracks) { mapIdList.push(track.id); }
        response = this.safeApiCall(
            `https://prod.trackmania.core.nadeo.online/mapRecords/?accountIdList=${accountId}&mapIdList=${mapIdList.join(",")}`,
            { method: "GET" }, false, `records`
        );
        if (!response.ok) return {
            status: { ok: false, message: "Couldn't retrieve records" },
            player: player,
            tracks: tracks
        };
        for (const record of response.data) {
            for (const track of tracks) {
                if (track.id === record.mapId) {
                    track.time = record.recordScore.time;
                }
            }
        }

        // ranking call
        let scores = [];
        let body = { "maps": [] };
        for (const track of tracks) {
            scores.push(`scores[${track.uid}]=${track.time}`);
            body.maps.push({ "mapUid": track.uid, "groupUid": "Personal_Best" })
        }
        response = this.safeApiCall(
            `https://prod.trackmania.core.nadeo.online/mapRecords/?accountIdList=${accountId}&mapIdList=${mapIdList.join(",")}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        },
            true, "rankings"
        );
        if (response.ok) return {
            status: { ok: false, message: "Couldn't retrieve rankings" },
            player: player,
            tracks: tracks
        };
        for (const rank of response.data) {
            for (const track of tracks) {
                if (track.uid === rank.mapUid && rank.zones[0].zoneName === "World") {
                    track.rank = rank.zones[0].ranking.position;
                    if (track.rank < 20000) --track.rank;
                }
            }
        }
        logSucces(`Rankings retrieved id - ${accountId}`)
        return {
            status: { ok: true, message: "Rankings retrieved" },
            player: player,
            tracks: tracks
        };
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
    console.log(`User connected from socket ${socket.id}`);
    socket.on('RankingRequest', async (accountId) => {
        console.log(`Ranking request id - ${accountId}`);
        socket.emit("RankingResponse", await nadeo.getCampaignRankings(0, accountId));
    });
});