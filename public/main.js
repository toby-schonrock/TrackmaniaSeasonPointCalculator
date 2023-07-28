const socket = io.connect('http://localhost:3000');

function getUrlVars() {
    var vars = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function (m, key, value) {
        vars[key] = value;
    });
    return vars;
}
function calculatePoint(p) {
    if (!(p > 0)) return 0;
    var tier = Math.ceil(Math.log10(p));
    if (tier < 2) {
        return 40000 / p;
    }
    else if (tier < 7) {
        var basePoints = 4000 / Math.pow(2, tier - 1);
        var rankMultiplier = Math.pow(10, tier - 1) / p + 0.9;
        return basePoints * rankMultiplier;
    }
    else {
        return 0;
    }
}
function calculateAll() {
    var total = 0;
    var saveRanks = "";
    $('.rank').each(function () {
        var value = $(this).val();
        if (!isNaN(parseInt(value))) {
            total += calculatePoint(value);
        } else {
            value = "";
        }
        saveRanks += value + ":";
    });
    document.getElementById('result').innerHTML = Math.round(total);
    localStorage.setItem("records", saveRanks);
    $('#link').val(window.location.href.split('?')[0] + "?ranks=" + saveRanks);
}
function copyLink() {
    var copyText = document.getElementById("link");
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    document.execCommand("copy");
    $('#copyResult').html("Copied to clipboard!");
}
function reset() {
    var total = 0;
    var saveRanks = "";
    var confirmed = confirm("Are you sure? All data will be lost.");
    if (confirmed) {
        $('.rank').each(function () {
            $(this).val("");
            $(this).change();
            var value = $(this).val();
            if (!isNaN(parseInt(value))) {
                total += calculatePoint(value);
            } else {
                value = "";
            }
            saveRanks += value + ":";
        });
        document.getElementById('result').innerHTML = Math.round(total);
        localStorage.setItem("records", saveRanks);
        $('#link').val(window.location.href.split('?')[0] + "?ranks=" + saveRanks);
    }
}
$(document).ready(function () {
    $('.rank').change(function () {
        var point = $(this).val();
        $('#p' + $(this).attr('id')).html(Math.round(parseInt(calculatePoint(point))));
        calculateAll();
    });
    socket.on('RankingResponse', (response) => {
        if (response.status.ok) {
            console.log(response.status.message);
            for (const track of response.tracks) {
                if (track.rank > 0) {
                    $('#w' + track.number).val(track.rank);
                    $('#p' + track.number).html(Math.round(parseInt(calculatePoint(track.rank))));
                } else {
                    $('#w' + track.number).val("");
                    $('#p' + track.number).html(0);
                }
            }
            calculateAll();
        } else console.error(response.status.message);
    });
    $("#button").on().click(() => {
        socket.emit("RankingRequest", $('#id-input').val())
    });
    var urlparameter = getUrlVars()["ranks"];
    if (urlparameter != undefined) {
        var savedRanks = urlparameter;
    } else {
        var savedRanks = localStorage.getItem("records");
    }
    if (savedRanks != null) {
        var savedRanksArray = savedRanks.split(":");
        var i = 0;
        $('.rank').each(function () {
            var rank = savedRanksArray[i];
            if (!isNaN(parseInt(rank))) {
                $(this).val(rank);
                $(this).change();
            }
            i++;
        });
    }
});