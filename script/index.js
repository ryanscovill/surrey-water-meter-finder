$(document).ready(function () {
    document.getElementById('form').onsubmit = function (e) {
      e.preventDefault();
      let accountNum = document.getElementById('accountnum').value;
      let address = $('#addressInput').val();

      if (!$('#submit').hasClass("disabled")) {
        if (accountNum || address) {
          $('#result-placeholder').html('')
          $("#submit").addClass("disabled")
        }
        $('#loading-spinner').show();
        if (accountNum) {
          showImageAccountNum(accountNum);
        } else if (address) {
          showImage(address)
        } else {
          $('#loading-spinner').hide();
        }
      }
    }
    function showImageAccountNum(accountNum) {
      let url = "https://gisservices.surrey.ca/arcgis/rest/services/Public/Water/MapServer/find?f=json&searchText=" + encodeURIComponent(accountNum) + "&contains=false&returnGeometry=true&layers=1%2C2&searchFields=ACCOUNT_NUMBER_N"
      getWaterService(url);
    }
    function showImage(queryAddress) {
      // query for address
      let url = "https://cosmos.surrey.ca/external/COSMOSWebServices/cosmos.svc/GetSearchData/" + encodeURIComponent(queryAddress) + "?page=1&start=0&limit=25"
      $.get(url, function (result) {
        if (result.length == 0) {
          showError("Could not find property.")
          return
        }
        // todo show address results and user chooses
        let addressId = result[0]["FieldValue"];
        // get Address info
        let url = "https://gisservices.surrey.ca/arcgis/rest/services/Public/Legal/MapServer/find?f=json&searchText=" + encodeURIComponent(addressId) + "&contains=false&returnGeometry=true&layers=0&searchFields=ADDRESSID"
        $.get(url, function (result) {
          if (!result.hasOwnProperty('results') || result.results.length == 0) {
            showError("Could not find property details.")
            return
          }
          let houseNum = result.results[0].attributes["HOUSE NUMBER"]
          let x = result.results[0].geometry.x;
          let y = result.results[0].geometry.y;
          let padding = 50
          let boundingBox = { "xmin": x - 50, "ymin": y - 50, "xmax": x + 50, "ymax": y + 50 }
          let boundingBoxParam = encodeURIComponent(JSON.stringify(boundingBox))
          let mapExtentParam = encodeURIComponent([boundingBox["xmin"], boundingBox["ymin"], boundingBox["xmax"], boundingBox["ymax"]].join(","))
          let url = "https://gisservices.surrey.ca/arcgis/rest/services/Public/Water/MapServer/identify?f=json&tolerance=5&returnGeometry=true&returnFieldName=false&returnUnformattedValues=false&imageDisplay=1011%2C888%2C96&geometry=" + boundingBoxParam + "&geometryType=esriGeometryEnvelope&mapExtent=" + mapExtentParam + "&layers=visible%3A1%2C2"
          getWaterService(url, houseNum)
        }).fail(function () {
          showError();
        })
      }).fail(function () {
        showError();
      })
    }

    function getWaterService(url, houseNum = null) {
      $.get(url, function (result) {
        $('#result-placeholder').html('')
        disableSpinner()
        let foundMeter = false;
        for (idx in result.results) {
          let meter = result.results[idx]
          let validEntry = meter.hasOwnProperty('attributes');
          if (validEntry && houseNum != null) {
            validEntry = meter.attributes.HOUSE == houseNum;
          }
          var accountNum = meter.attributes["ACCOUNT NUMBER"]
          if (validEntry && accountNum) {
            foundMeter = true;
            if (meter.attributes.hasOwnProperty('IMAGE') && meter.attributes.IMAGE.length > 1) {
              var imgHtml = `<img class="meter-image" src="${meter.attributes.IMAGE}">`;
            } else {
              var imgHtml = "<p> No image found </p>"
            }
            let mapHtml = `
            <div id="map-${accountNum}" class="map"></div>
            `
            let address = meter.attributes["HOUSE"] + " " + meter.attributes["STREET"]
            let html = `
                  <div class="card">
                    ${mapHtml}
                    ${imgHtml}
                    <p>Address: ${address}</p>
                    <p>Meter Account: ${accountNum}</p>
                    <p>Installed Date: ${meter.attributes["INSTALLED DATE"]}</p>
                    <p>Last Read: ${meter.attributes["LAST READ"]}</p>
                    <p>Last Read Date: ${meter.attributes["LAST READ DATE"]}</p>
                    <p>Location Description: ${meter.attributes["LOCATION DESCRIPTION"]}</p>
                  </div>
                    `
            $('#result-placeholder').append(html)
            coordinates = proj4("+proj=utm +zone=10","+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs",[meter.geometry.x, meter.geometry.y]);
            initMap("map-"+accountNum, coordinates[1], coordinates[0]);
          }
        }
        if (!foundMeter) {
          showError("Could not find a meter at this property.");
        } else {
          $('#error').hide()
        }
      }).fail(function () {
        showError();
      })
    }

    function showError(message) {
      defaultMessage = "An error occurred.  Please try using an account #."
      if (!message) {
        message = defaultMessage;
      }
      $('#error').show();
      $('#error p').text(message);
      disableSpinner();
    }

    function disableSpinner() {
      $("#submit").removeClass("disabled")
      $('#loading-spinner').hide()
    }
  })

  new autoComplete({
    data: {
      src: async () => {
        const query = document.querySelector("#addressInput").value;
        const url = "https://cosmos.surrey.ca/external/COSMOSWebServices/cosmos.svc/GetSearchData/" + encodeURIComponent(query) + "?page=1&start=0&limit=5"
        const source = await fetch(url);
        const data = await source.json();
        const data2 = data.filter(row => row["ListValue"].endsWith(" - Address"))
        const data3 = data2.map(row => row["ListValue"].slice(0, -10))
        return data3;
      },
      cache: false
    },
    selector: "#addressInput",
    threshold: 2,
    debounce: 300,
    searchEngine: "loose",
    resultsList: {
      render: true,
      /* if set to false, add an eventListener to the selector for event type
         "autoComplete" to handle the result */
      container: source => {
        source.setAttribute("id", "address_results");
      },
      destination: document.querySelector("#addressInput"),
      position: "afterend",
      element: "ul"
    },
    maxResults: 5,
    highlight: true,
    resultItem: {
      content: (data, source) => {
        source.innerHTML = data.match;
      },
      element: "li"
    },
    onSelection: selected => {
      $('#addressInput').val(selected.selection.value);
    }
  });

// Initialize and add the map
function initMap(id, lat, lng) {
  // The location of Uluru
  var uluru = {lat: lat, lng: lng};
  // The map, centered at Uluru
  var map = new google.maps.Map(
      document.getElementById(id), {zoom: 20, center: uluru, mapTypeId: 'satellite'});
  // The marker, positioned at Uluru
  var marker = new google.maps.Marker({position: uluru, map: map});
}
