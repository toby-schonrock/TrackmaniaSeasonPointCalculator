const express = require('express')
const port = process.env.PORT || 3000;


const app = express();
const dir = __dirname + '\\public';

const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

function logError(msg) {
    console.log(`\x1b[31m${msg}\x1b[0m`);
}

function logSucces(msg) {
    console.log(`\x1b[32m${msg}\x1b[0m`);
}

async function ValidateResponse(response, request) {
    if (response.ok) {
        // console.log(`${request} recieved`);
        return true;
    } else {
        logError(`${request} not recieved`);
        console.log(response.statusText);
        console.log(await response.json());
        return false;
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

class Api {
    servicesToken = "";
    liveServicesToken = "";
    servicesRefresh = "";
    liveServicesRefresh = "";

    constructor() { }

    async connect(username, password) {
        let basic = `Basic ${btoa(`${username}:${password}`)}`;
        let response = await this.getToken(basic, "NadeoServices")
        this.servicesToken = response.accessToken;
        this.servicesRefresh = response.refreshToken;
        response = await this.getToken(basic, "NadeoLiveServices")
        this.liveServicesToken = response.accessToken;
        this.liveServicesRefresh = response.refreshToken;
    }

    async getToken(basic, audience) {
        let response = await fetch("https://prod.trackmania.core.nadeo.online/v2/authentication/token/basic", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": basic
            },
            body: JSON.stringify({ "audience": audience })
        })
        ValidateResponse(response, `${audience} tokens`);
        return await response.json();
    }

    async getCampaignRankings(campaign, playerId) {
        let tracks = [];

        // fetch campaign call
        let response = await fetch(`https://live-services.trackmania.nadeo.live/api/token/campaign/official?offset=${campaign}&length=1`, {
            method: "GET",
            headers: { "Authorization": `nadeo_v1 t=${this.liveServicesToken}` }
        })
        if (!await ValidateResponse(response, `campaign ${campaign}`)) return { status: { ok: false, message: `Couldn't retrieve campaign` }, tracks: {} };
        let playlist = (await response.json()).campaignList[0].playlist;
        let uids = [];
        for (const map of playlist) {
            tracks.push(new Track(map.position + 1, "", map.mapUid));
            uids.push(map.mapUid);
        }

        // map id call
        response = await fetch(`https://prod.trackmania.core.nadeo.online/maps/?mapUidList=${uids.join(",")}`, {
            method: "GET",
            headers: { "Authorization": `nadeo_v1 t=${this.servicesToken}` }
        })
        if (!await ValidateResponse(response, "map ids")) return { status: { ok: false, message: "Couldn't retrieve maps" }, tracks: {} };
        let mapList = await response.json()
        for (const map of mapList) {
            for (const track of tracks) {
                if (track.uid === map.mapUid) {
                    track.id = map.mapId;
                }
            }
        }

        // record call
        let mapIdList = []
        for (const track of tracks) { mapIdList.push(track.id); }
        response = await fetch(`https://prod.trackmania.core.nadeo.online/mapRecords/?accountIdList=${playerId}&mapIdList=${mapIdList.join(",")}`, {
            method: "GET",
            headers: { "Authorization": `nadeo_v1 t=${this.servicesToken}` }
        })
        if (!await ValidateResponse(response, "records")) return { status: { ok: false, message: "Couldn't retrieve records" }, tracks: {} };
        let records = await response.json()
        for (const record of records) {
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
        response = await fetch(`https://live-services.trackmania.nadeo.live/api/token/leaderboard/group/map?${scores.join("&")}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `nadeo_v1 t=${this.liveServicesToken}`
            },
            body: JSON.stringify(body)
        })
        if (!await ValidateResponse(response, "rankings")) return { status: { ok: false, message: "Couldn't retrieve rankings" }, tracks: {} };
        let rankings = await response.json();
        for (const rank of rankings) {
            for (const track of tracks) {
                if (track.uid === rank.mapUid && rank.zones[0].zoneName === "World") {
                    track.rank = rank.zones[0].ranking.position;
                    if (track.rank < 20000) --track.rank;
                }
            }
        }
        logSucces(`Rankings retrieved id - ${playerId}`)
        return { status: { ok: true, message: "Rankings retrieved" }, tracks: tracks };
    }
};

let nadeo = new Api();
// get credentials
const fs = require('fs');
let password;
try {
    password = fs.readFileSync('cred.txt', 'utf8');
    console.log(`password: ${password.toString()}`);
} catch (e) {
    console.log('Error:', e.stack);
}

nadeo.connect("SeasonPointCalculator", password);

app.get('/', (req, res) => {
    res.sendFile(dir.concat('\\views\\index.html'));
});

app.use(express.static('public'));

server.listen(port, () => {
    console.log("listening on %s", port);
})

io.on('connection', (socket) => {
    console.log(`User connected from socket ${socket.id}`);
    socket.on('RankingRequest', async (playerId) => {
        console.log(`Ranking request id - ${playerId}`);
        socket.emit("RankingResponse", await nadeo.getCampaignRankings(0, playerId));
    });
});