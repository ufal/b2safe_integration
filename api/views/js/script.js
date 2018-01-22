var status2cssClass = {
    "COMPLETED": "success",
    "IN PROGRESS": "info",
    "QUEUED": "warning",
    "DELETING": 'danger',
    "ERROR": "danger"
};

function displayItem(item, container) {
    var checksum = item.checksum;
    if (item.verified === true) {
        checksum = "<i class='text-success fa fa-check-square' data-toggle='tooltip' data-placement='bottom' title='Checksum verified from server'> </i> ";
    } else if (item.verified === false) {
        checksum = "<i class='text-danger fa fa-warning' data-toggle='tooltip' data-placement='bottom' title='Invalid checksum received from server'> </i> ";
    } else {
        checksum = "-";
    }

    var actions = "&nbsp;";
    // windows
    item.filename = (item.filename || "").replace(/\\/g,'\\\\');

    if (item.status === 'COMPLETED') {
        if (item.splitted) {
            actions = "<a href='#' data-toggle='modal' class='download-instructions' data-target='#download-cli'><i class='text-dark fa fa-download'> </i></a> <a href='#' onclick='remove(\""
                + item.handle
                + "\", \""
                + item.filename
                + "\");'><i class='text-danger fa fa-window-close'> </i></a>";
        } else {
            actions = "<a href='./retrieve?handle="
                + item.handle
                + "'><i class='text-dark fa fa-download'> </i></a> <a href='#' onclick='remove(\""
                + item.handle + "\", \"" + item.filename
                + "\");'><i class='text-danger fa fa-window-close'> </i></a>";
        }
    } else if (item.status === 'ERROR') {
        actions = "<a href='#' onclick='remove(\"" + item.handle
            + "\", \"" + item.filename
            + "\");'><i class='text-danger fa fa-window-close'> </i></a>"
            + " <a href='#' onclick='requeue(\"" + item.handle
            + "\", \"" + item.filename
            + "\");'><i class='text-info fa fa-repeat'> </i></a>";
    }

    var repData = "";
    if (item.splitted) {
        if (item.replication_error) {
            repData = "<div><table class=\"table table-sm\" style=\"font-size: 12px;\">";
            for (var key in item.replication_error) {
                repData += "<tr><td><strong>" + key + "</strong></td><td>"
                    + item.replication_error[key] + "</td></tr>";
            }
            repData += "</table></div>";
        } else {
            repData = "<div>"
                + "<table class=\"table table-sm\" style=\"font-size: 12px;\">";
            for (var key in item.replication_data) {
                repData += "<tr><td><strong>" + key + "</strong></td><td>"
                    + item.replication_data[key] + "</td></tr>";
            }
            repData += "<tr><td colspan='2'><strong style=\"font-size: 12px;\">Uploaded in parts</strong></td></tr>";
            /*
             * for ( var key in item.splitfiles) { repData += "<tr><td colspan='2'>" +
             * item.splitfiles[key].name + " <span class='badge badge-" +
             * status2cssClass[item.splitfiles[key].status] + "'>" +
             * item.splitfiles[key].status + "</span>" + "</td></tr>"; }
             */
            repData += "</table></div>";
        }
    } else {
        if (item.replication_data) {
            repData = "<div><table class=\"table table-sm\" style=\"font-size: 12px;\">";
            for (var key in item.replication_data) {
                repData += "<tr><td><strong>" + key + "</strong></td><td>"
                    + item.replication_data[key] + "</td></tr>";
            }
            repData += "</table></div>";

        } else if (item.replication_error) {
            repData = "<div><table class=\"table table-sm\" style=\"font-size: 12px;\">";
            for (var key in item.replication_error) {
                repData += "<tr><td><strong>" + key + "</strong></td><td>"
                    + item.replication_error[key] + "</td></tr>";
            }
            repData += "</table></div>";
        }
    }

    container
        .append("<tr class='table-"
            + status2cssClass[item.status]
            + "'>"
            + "<td class='align-middle' data-role='handle'>"
            + item.handle
            + "</td>"
            + "<td class='align-middle'>"
            + checksum
            + "</td>"
            + "<td class='align-middle'>"
            + item.filesize
            + " MB </td>"
            + "<td class='align-middle'>"
            + item.end_time
            + "</td>"
            + "<td class='align-middle'>"
            + "<span data-container='body' data-toggle='popover' data-trigger='hover' data-placement='bottom' data-content='"
            + repData.replace(/'/g, '"') + "' class='badge badge-"
            + status2cssClass[item.status] + "'>" + item.status + "</span>"
            + "</td>" + "<td class='align-middle'>" + actions + "</td>" + "</tr>");
}

function loadList() {

    var container = $("#item_list").html("");

    $.getJSON(
        './list',
        function (data) {
            data.forEach(function (item) {
                if (item.count > 1) {
                    var c_id = "h_" + item._id.replace(/\//g, "_").replace(/:/g, "_");
                    container
                        .append("<tr><td colspan=\"4\"><table id=\"" + c_id
                            + "\" class=\"table table-sm\" style=\"font-size: 12px;\"></table></td></tr>");
                    for (var i in item.fileList) {
                        var subItem = item.fileList[i];
                        innerContainer = $("#" + c_id);
                        displayItem(subItem, innerContainer);
                    }
                } else {
                    displayItem(item.fileList[0], container);
                }
            });

            $('[data-toggle="tooltip"]').tooltip();

            $('[data-toggle="popover"]').popover({
                container: 'body',
                html: true
            });
        });
}

function remove(handle, filename) {
    $.ajax({
        url: './remove?handle=' + handle + '&filename='
        + filename,
        type: 'DELETE',
        success: function (data) {
            loadList();
        }
    });
}

function requeue(handle, filename) {
    $.post('./replicate', {
        'handle': handle,
        'filename': filename,
        'checksum': ''
    }, function (data, textStatus) {
        loadList();
    });
}

$(document).on("click", ".download-instructions", function () {
    var handle = $(this).parent().parent().find('[data-role="handle"]').text();
    $('#download-handle').text(handle);
});

$(document).ready(function () {

    loadList();

    $("#upload").click(function () {

        var handle = $("#handle").val();
        var filename = $("#file").val();
        var checksum = $("#checksum").val();
        $.post('./replicate', {
            'handle': handle,
            'filename': filename,
            'checksum': checksum
        }, function (data, textStatus) {
            loadList();
        });
    });

});