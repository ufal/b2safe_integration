var status2cssClass = {
  "COMPLETED" : "success",
  "IN PROGRESS" : "info",
  "QUEUED" : "warning",
  "DELETING" : 'danger',
  "ERROR" : "danger",
  "FOLDER" : "primary",
};

function timeConversion(ms) {

  var seconds = (ms / 1000).toFixed(1);
  var minutes = (ms / (1000 * 60)).toFixed(1);
  var hours = (ms / (1000 * 60 * 60)).toFixed(1);
  var days = (ms / (1000 * 60 * 60 * 24)).toFixed(1);

  if (seconds < 60) {
    return seconds + " Sec";
  } else if (minutes < 60) {
    return minutes + " Min";
  } else if (hours < 24) {
    return hours + " Hrs";
  } else {
    return days + " Days"
  }

}

function displayItem(item, table) {
  var status = item.status;
  var status_class = status2cssClass[status];
  var verified = item.verified;
  var filename = item.filename;
  filename = filename.substring(filename.lastIndexOf('/') + 1);
  filename = filename.substring(filename.lastIndexOf('\\') + 1);
  var checksum = "";
  var splitted = "";
  var lastUpdated = "";

  if (verified === true) {
    checksum = "<i class='text-success fa fa-lg fa-check' data-toggle='tooltip' data-placement='bottom' title='Checksum verfied from server'> </i>";
  } else if (verified === false) {
    checksum = "<i class='text-danger fa fa-lg fa-warning' data-toggle='tooltip' data-placement='bottom' title='Invalid checksum received from server'> </i>";
  } else {
    checksum = "<i class='text-danger fa fa-lg fa-question' data-toggle='tooltip' data-placement='bottom' title='Checksum not received yet'> </i>";
  }

  var processing_time = "";

  if (item.end_time) {
    lastUpdated = new Date(item.end_time);
  } else {
    lastUpdated = new Date(item.start_time);
  }

  if (item.start_time && item.end_time) {
    var tt = Math.round((new Date(item.end_time).getTime() - new Date(
        item.start_time).getTime()));
    tt = timeConversion(tt);
    processing_time = "<div style='font-size: 12px;'>Processing time: <strong>"
        + tt + "</strong></div>";
  }

  if (item.splitted === 1) {
    splitted = "<i class='text-info fa fa-files-o' data-toggle='tooltip' data-placement='bottom' title='Uploaded in parts'> </i>";
  }

  var repData = "";
  var dt = {
    "Status" : "Not yet recevied."
  };
  if (item.replication_error) {
    dt = item.replication_error;
  } else if (item.replication_data) {
    dt = item.replication_data;
  }
  repData = "<div><table class='table table-sm' style='font-size: 10px; margin: 0px;'>";
  repData += "<thead class='thead-dark'><tr><th colspan='2'><strong>"
      + item.handle + "/" + filename + "</strong></th></tr></thead><tbody>";
  for ( var key in dt) {
    repData += "<tr><td><strong>"
        + key
        + "</strong></td><td style='max-width: 400px; overflow-wrap: break-word;'>"
        + JSON.stringify(dt[key]) + "</td></tr>";
  }
  repData += "</table></div>";
  repData.replace(/'/g, '"');

  var cells = [];

  cells
      .push("<div class='col-md-12' style='margin-bottom: 4px;'><strong>"
          + item.handle
          + "</strong> "
          + checksum
          + " "
          + splitted
          + "</div>"
          + "<div class='col-md-12' style='font-size: 11px;'>Local Filename: <strong>"
          + filename + "</strong>&nbsp;&nbsp;&nbsp;Size: <strong>"
          + item.filesize + " MBs</strong></div>");

  cells
      .push("<div data-container='body' data-toggle='popover' data-trigger='hover' data-placement='bottom' data-content='"
          + repData.replace(/'/g, '"')
          + "' class='badge badge-"
          + status_class
          + "'>" + status + "</div>");

  cells.push("<div style='font-size: 12px; margin-bottom: 4px;'><strong>"
      + lastUpdated + "</strong></div>" + processing_time)

  if (status === "COMPLETED") {
    cells
        .push("<a href='http://localhost:3000/retrieve?handle="
            + item.handle
            + "'><i class='text-dark fa fa-lg fa-download'> </i></a> <a href='#' onclick='javascript:remove(\""
            + item.handle + "\", \"" + item.filename
            + "\");'><i class='text-danger fa fa-lg fa-window-close'> </i></a>");
  } else if (status === "ERROR") {
    cells.push("<a href='#' onclick='javascript:remove(\"" + item.handle
        + "\", \"" + item.filename
        + "\");'><i class='text-danger fa fa-lg fa-window-close'> </i></a>"
        + " <a href='#' onclick='javascript:requeue(\"" + item.handle
        + "\", \"" + item.filename
        + "\");'><i class='fa fa-lg fa-repeat'> </i></a>");
  } else {
    cells.push("<div></div>");
  }

  var tr = jQuery("<tr class='table-" + status_class + "'></tr>");
  for ( var i in cells) {
    var td = jQuery("<td></td>");
    td.append(cells[i]);
    tr.append(td);
  }
  table.append(tr);
}

function displayFolder(fileList, table) {
  var item = fileList[0];
  var status = "FOLDER";
  var status_class = status2cssClass[status];
  var allcompleted = true;
  var error = false;
  var ff = "";
  var lastUpdated = "";
  for ( var i in fileList) {
    var file = fileList[i];
    var filename = file.filename;
    filename = filename.substring(filename.lastIndexOf('/') + 1);
    filename = filename.substring(filename.lastIndexOf('\\') + 1);
    var verified = file.verified;
    if (file.end_time) {
      if (lastUpdated === "") {
        lastUpdated = new Date(file.end_time);
      } else {
        var dd = new Date(file.end_time);
        if (dd > lastUpdated) {
          lastUpdated = dd;
        }
      }
    }
    var checksum = "";
    if (verified === true) {
      checksum = "<i class='text-success fa fa-lg fa-check' data-toggle='tooltip' data-placement='bottom' title='Checksum verfied from server'> </i>";
    } else if (verified === false) {
      checksum = "<i class='text-danger fa fa-lg fa-warning' data-toggle='tooltip' data-placement='bottom' title='Invalid checksum received from server'> </i>";
    } else {
      checksum = "<i class='text-danger fa fa-lg fa-question' data-toggle='tooltip' data-placement='bottom' title='Checksum not received yet'> </i>";
    }
    var st = file.status;
    var st_class = status2cssClass[st];
    if (st !== "COMPLETED") {
      allcompleted = false;
    }
    if (st === "ERROR") {
      error = true;
    }

    var repData = "";
    var dt = {
      "Status" : "Not yet recevied."
    };
    if (file.replication_error) {
      dt = file.replication_error;
    } else if (file.replication_data) {
      dt = file.replication_data;
    }
    repData = "<div><table class='table table-sm' style='font-size: 10px; margin: 0px;'>";
    repData += "<thead class='thead-dark'><tr><th colspan='2'><strong>"
        + file.handle + "/" + filename + "</strong></th></tr></thead><tbody>";
    for ( var key in dt) {
      repData += "<tr><td><strong>"
          + key
          + "</strong></td><td style='max-width: 400px; overflow-wrap: break-word;'>"
          + JSON.stringify(dt[key]) + "</td></tr>";
    }
    repData += "</tbody></table></div>";
    repData.replace(/'/g, '"');

    var splitted = "";
    if (file.splitted === 1) {
      splitted = "<i class='text-info fa fa-files-o' data-toggle='tooltip' data-placement='bottom' title='Uploaded in parts'> </i>";
    }

    ff += "<div class='row' style='font-size: 12px; margin-bottom: 4px;'>"
        + "<div class='col-md-4'>Local Filename: <strong>"
        + filename
        + "</strong> "
        + checksum
        + " "
        + splitted
        + "</div>"
        + "<div class='col-md-3'>Size: <strong>"
        + file.filesize
        + " MBs</strong></div>"
        + "<div class='col-md-2'><span data-container='body' data-toggle='popover' data-trigger='hover' data-placement='bottom' data-content='"
        + repData.replace(/'/g, '"') + "'class='badge badge-" + st_class + "'>"
        + st + "</span></div>" + "</div>";
  }

  var cells = [];

  cells
      .push("<div class='container' style='margin-left: 10px;'><div class='row' style='margin-bottom: 4px;'><strong>"
          + item.handle + "</strong></div>" + ff + "</div>");

  cells.push("<div><span class='badge badge-" + status_class + "'>" + status
      + "</span></div>");

  cells.push("<div style='font-size: 12px; margin-bottom: 4px;'><strong>"
      + lastUpdated + "</strong></div>");

  if (allcompleted) {
    cells
        .push("<a href='http://localhost:3000/retrieve?handle="
            + item.handle
            + "'><i class='text-dark fa fa-lg fa-download'> </i></a> <a href='#' onclick='javascript:remove(\""
            + item.handle
            + "\", null);'><i class='text-danger fa fa-lg fa-window-close'> </i></a>");
  } else if (error) {
    cells
        .push("<a href='#' onclick='javascript:remove(\""
            + item.handle
            + "\", null);'><i class='text-danger fa fa-lg fa-window-close'> </i></a>"
            + " <a href='#' onclick='javascript:requeue(\"" + item.handle
            + "\", null);'><i class='fa fa-lg fa-repeat'> </i></a>");
  } else {
    cells.push("<div></div>");
  }

  if (error) {
    status_class = status2cssClass["ERROR"];
  }

  var tr = jQuery("<tr class='table-" + status_class + "'></tr>");
  for ( var i in cells) {
    var td = jQuery("<td></td>");
    td.append(cells[i]);
    tr.append(td);
  }
  table.append(tr);
}

function loadList() {

  var container = jQuery("#item_list").html("");

  jQuery.getJSON('./list', function (data) {
    data.forEach(function (item) {
      if (item.count > 1) {
        displayFolder(item.fileList, container);
      } else {
        displayItem(item.fileList[0], container);
      }

    });

    jQuery('[data-toggle="tooltip"]').tooltip();

    jQuery('[data-toggle="popover"]').popover({
      container : 'body',
      html : true
    });

  });
}

function remove(handle, filename) {
  jQuery.ajax({
    url : 'http://localhost:3000/remove?handle=' + handle + '&filename='
        + filename,
    type : 'DELETE',
    success : function (data) {
      loadList();
    }
  });
}

function requeue(handle, filename) {
  jQuery.post('http://localhost:3000/replicate', {
    'handle' : handle,
    'filename' : filename,
    'checksum' : '',
  }, function (data, textStatus) {
    loadList();
  });
}

jQuery(jQuery.document).ready(function () {

  loadList();

  jQuery("#upload").click(function () {

    var handle = jQuery("#handle").val();
    var filename = jQuery("#file").val();
    var checksum = jQuery("#checksum").val();
    jQuery.post('http://localhost:3000/replicate', {
      'handle' : handle,
      'filename' : filename,
      'checksum' : checksum
    }, function (data, textStatus) {
      loadList();
    });
  });

});