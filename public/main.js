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

function addPlayerDetails() {
    let temp = $(playerTemplate).clone();
    $(".player-details-section").append(temp);
}

function calculateTotal(

) { };

$(document).ready(function () {
    trackTemplate = $("#track-template").html();
    playerTemplate = $("#player-details-template").html();
    generateTracks();
    $('.rank').change(function () {
        var point = $(this).val();
        $('#points' + $(this).attr('id').slice(4)).val(Math.round(parseInt(calculatePoints(point))));
        calculateTotal();
    });
    socket.on('RankingResponse', (response) => {
        if (response.status.ok) {
            console.log(response.status.message);
            console.log(response)

            if (!$(".player-details").length) addPlayerDetails();
            
            $(".player-id").html(response.player.accountId);

            for (const track of response.tracks) {
                if (track.rank > 0) {
                    $('#rank' + track.number).val(track.rank);
                    $('#points' + track.number).val(Math.round(parseInt(calculatePoints(track.rank))));
                } else {
                    $('#rank' + track.number).val("");
                    $('#points' + track.number).val(0);
                }
            }
            calculateTotal();
        } else console.error(response.status.message);
    });
    $("#id-button").on().click(() => {
        socket.emit("RankingRequest", $('#id-input').val())
    });
});