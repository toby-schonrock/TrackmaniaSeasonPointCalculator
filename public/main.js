const socket = io.connect('http://localhost:3000');

let trackTemplate;
let playerTemplate;

function calculatePoints(rank) {
    if (!(rank > 0)) return 0;
    var tier = Math.ceil(Math.log10(rank));
    if (tier < 2) {
        return 40000 / rank;
    }
    else if (tier < 7) {
        var basePoints = 4000 / Math.pow(2, tier - 1);
        var rankMultiplier = Math.pow(10, tier - 1) / rank + 0.9;
        return basePoints * rankMultiplier;
    }
    else {
        return 0;
    }
}

function generateTracks() {
    for (let i = 0; i < 25; ++i) {
        let temp = $(trackTemplate).clone();
        $(temp).find("#track-number").html(i + 1);
        $(temp).find("#rank-field").prop('id', `rank${i + 1}`);
        $(temp).find("#points-display").prop('id', `points${i + 1}`);
        $(`#row${(i % 5) + 1}`).append(temp);
    }
};

function updatePlayer(player) {
    $("#player-name").html(player.name);
    $("#player-age").html(`${player.timeStamp.slice(0, 10)}`);
    $("#trackmania-com-button").attr("href", `https://trackmania.io/#/player/${player.id}`);
    $("#trackmania-io-button").attr("href", `https://www.trackmania.com/players/${player.id}`);
}

function updateTotal() { };

function validPlayerId(id) {
    return id.length === 36 &&
        id[8] == "-" &&
        id[13] == "-" &&
        id[18] == "-" &&
        id[23] == "-"
}

$(document).ready(function () {
    trackTemplate = $("#track-template").html();
    playerTemplate = $("#player-details-template").html();
    generateTracks();
    $('.rank').change(function () {
        var point = $(this).val();
        $('#points' + $(this).attr('id').slice(4)).val(Math.round(parseInt(calculatePoints(point))));
        updateTotal();
    });
    socket.on('RankingResponse', (response) => {
        if (response.status.ok) {
            console.log(response.status.message);
            console.log(response); // TODO remove

            if (!$(".player-details").length) {
                let temp = $(playerTemplate).clone();
                $(".player-details-section").append(temp);
            }
            updatePlayer(response.player);

            for (const track of response.campaign.tracks) {
                if (track.rank > 0) {
                    $('#rank' + track.number).val(track.rank);
                    $('#points' + track.number).val(Math.round(parseInt(calculatePoints(track.rank))));
                } else {
                    $('#rank' + track.number).val("");
                    $('#points' + track.number).val(0);
                }
            }
            updateTotal();
        } else console.error(response.status.message);
    });
    let previousPlayerRequest = "";
    $("#id-button").on().click(() => {
        let id = $('#id-input').val().trim().toLowerCase();
        if (previousPlayerRequest == id && false) { // TODO broken for testing
            console.log(`Request not made due to repeated id - ${previousPlayerRequest}`);
        } else if (!validPlayerId(id)) {
            console.error(`Suspected invalid PlayerId - ${id}`);
        } else {
            socket.emit("RankingRequest", id);
            previousPlayerRequest = id;
        }
    });
});