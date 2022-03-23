var ViaReportButton = document.getElementById("ViaReport");
if (ViaReportButton) {
    ViaReportButton.onclick = function() {

        isEregKsrzisSignedIn(function(isSignedIn) {

            if(isSignedIn) {

                getRegistrLoginCookies(function (cookieParams) {

                    var kodOsoby = cookieParams.get("kodOsoby");
                    var heslo = cookieParams.get("heslo");
                
                    if(!kodOsoby || !heslo) {
                        alert("Je potřeba být přihlášený do registru Žadanky Covid-19.")
                    } else {
                        var url = chrome.runtime.getURL("assets/Zadanky.xlsx");
                        fetch(url)
                            .then(response => {
                                response.arrayBuffer().then(xlsxBytes => {

                                    var workbook = XLSX.readFile(xlsxBytes);

                                    var firstSheetName = workbook.SheetNames[0];
                                    var worksheet = workbook.Sheets[firstSheetName];
                                    var startIndex = 2;

                                    tryToFixAllProfiles(startIndex, worksheet);
                            });
                        });
                    }  
                });
            } else {
                alert("Je potřeba být přihlášený do modulu Pacienti Covid-19.")
            }
        });
    }
}

function getRegistrLoginCookieName() {
    return "MyUniqueKey";
}

function getRegistrLoginCookies(callback) {
    var registrUrl = getRegistrUrl();

    chrome.cookies.get({
        url: registrUrl, 
        name: getRegistrLoginCookieName()
    }, function(cookie) {
        if(!cookie) {
            callback(new URLSearchParams());
        } else {
            var cookieParams = new URLSearchParams(cookie.value);
            callback(cookieParams);
        }
    });
}

async function tryToFixForeignProfile(index, ZadankaData, CisloPacienta, KoloOprav) {
    return await trySloucitForeignProfilesFoundByZadankaData(index, ZadankaData, CisloPacienta, KoloOprav).then(function(DosloNaSlucovani) {

        // U většího kola velká pravděpodobnost, že to vytváří nové profily (chování kdy vyhledání dle místa narození profil založí přesto, že už jeden existuje, ale není na něm přidělené rodné číslo např.)
        if(DosloNaSlucovani && KoloOprav < 3) {
            tryToFixForeignProfile(index, ZadankaData, CisloPacienta, ++KoloOprav);
        }
    });
}

async function tryToFixProfile(index, CisloZadanky, CisloPacienta, KoloOprav = 1) {
    return new Promise(function (resolve, reject) {

        getZadankaData(CisloZadanky).then(function(ZadankaData) {

            if(!ZadankaData || ZadankaData.Cislo != CisloZadanky) {
                resolve();
            } else {
                if(ZadankaData.TestovanyNarodnostKod != "CZ") {
                    tryToFixForeignProfile(index, ZadankaData, CisloPacienta, KoloOprav).then(function() {
                        resolve();
                    })
                } else {
                    resolve();
                }
            }
        });
    });
}

async function tryToFixAllProfiles(index, worksheet) {
    var CisloZadanky = worksheet["B" + index].h;
    var CisloPacienta = worksheet["F" + index].h;
    //CisloPacienta = 3867782811; // only testing purpose
    //CisloZadanky = 3640131302; // only testing purpose

    while(CisloZadanky && CisloPacienta) {

        await tryToFixProfile(index, CisloZadanky, CisloPacienta); 

        index++;
        try {
            CisloZadanky = worksheet["B" + index].h;
            CisloPacienta = worksheet["F" + index].h;
            //CisloZadanky = null;  // only testing purpose
            //CisloPacienta = null;  // only testing purpose
        } catch(e) {
            break;
        }
    }
}


function isEregKsrzisSignedIn(callback) {
    var url = getEregRegistrUrl();
  
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function() {
        if(xhr.readyState === XMLHttpRequest.DONE) {
  
            if(xhr.status == 200) {
  
                var parser = new DOMParser();
                var responseDocument = parser.parseFromString(xhr.responseText,"text/html");
  
                if(responseDocument.title.includes("Přihlášení")) {
                    callback(false);
                } else {
                    callback(true);
                }
            } else {
                callback(false);
            }
        }
    };
    xhr.send();
}

function tryToSloucitForeignProfiles(index, ZadankaData, SlucujiciProfil, SlucovanyProfil, KoloOprav) {
    return new Promise(function (resolve, reject) {

        getRegistrCUDZadankyPacientDetailSloucitPacientyUrl(function(url) {

            var urlParams = getRegistrCUDZadankyPacientDetailSloucitPacientyUrlParams(null, SlucujiciProfil.Cislo, SlucovanyProfil.Cislo);

            var xhr = new XMLHttpRequest();
            xhr.open("POST", url, true);
            xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
            xhr.onreadystatechange = function() {
                if(xhr.readyState === XMLHttpRequest.DONE) {

                    var url = SlucovanyProfil.Link;

                    var xhrSlucovanyProfil = new XMLHttpRequest();
                    xhrSlucovanyProfil.open("GET", url, true);
                    xhrSlucovanyProfil.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
                    xhrSlucovanyProfil.onreadystatechange = function() {
                        if(xhrSlucovanyProfil.readyState === XMLHttpRequest.DONE) {

                            console.log("DEBUG: Zadanka: " + ZadankaData.TestovanyNarodnostKod, ZadankaData.TestovanyNarodnostNazev + ", PacientInfo NarodnostKod a RobObcanstviZemeKod: " + SlucovanyProfil.Pacient_NarodnostKod, SlucovanyProfil.Pacient_RobObcanstviZemeKod);

                            if(ZadankaData.TestovanyDatumNarozeniText != SlucovanyProfil.PacientDatumNarozeniText) {
                                console.log("DEBUG: Datum narození pacient: " + SlucovanyProfil.PacientDatumNarozeniText, ", žádanka: " + ZadankaData.TestovanyDatumNarozeniText, ", pojistovna: " + ZadankaData.TestovanyZdravotniPojistovnaKod , ", ordinace IČP: " + ZadankaData.OrdinaceICP);   
                            }

                            // podařilo se sloučit?
                            if(xhrSlucovanyProfil.status != 200) { 
                                console.log("Vyžádaná úprava k Excel řádku č. " + index + ". " + KoloOprav + ". kolo oprav. Cizinec. Žádanka č. " + ZadankaData.Cislo + ". Byl sloučený pacient č. " + SlucovanyProfil.Cislo + " do pacienta č. " + SlucujiciProfil.Cislo + ".");
                                resolve(true);
                            } else {
                                console.log("Vyžádaná úprava k Excel řádku č. " + index + ". " + KoloOprav + ". kolo oprav. Cizinec. Žádanka č. " + ZadankaData.Cislo + ". CHYBA. Nepodařil se sloučit pacient č. " + SlucovanyProfil.Cislo + " do pacienta č. " + SlucujiciProfil.Cislo + ".");
                                resolve(false);
                            }
                        }
                    }
                    xhrSlucovanyProfil.send();
                }
            };
            xhr.send(urlParams.toString());
        });
    });
}

function getSpatneStatniPrislustnost(StatniPrislusnost) {

    // správně, return špatně vytvořený profil s danou státní příslušností
    switch(StatniPrislusnost) {
        // Irsko
        case "IE":
            // Írán
            return "IR";
        // Írán
        case "IR":
            // Irsko
            return "IE";
        // Moldavsko
        case "MD":
            // Makao
            return "MO";
        // Makao
        case "MO":
            // Moldavsko
            return "MD";
        // Ukrajina
        case "UA":
            // Spojené království
            return "UK";
        // Spojené království
        case "UK":
            // Ukrajina
            return "UA";
        // Arménie
        case "AM":
            // Argentina
            return "AR";
        // Arménie
        case "AR":
            // Argentina
            return "AM";
        // Rumunsko
        case "RO":
            // Rusko
            return "RU";
        // Rusko
        case "RU":
            // Rumunsko
            return "RO";
        default:
            return StatniPrislusnost;
    }
}

function tryToFindForeignProfilesByZadankaData(ZadankaData, callback) {

    var DatumNarozeniSpatneVygenerovanyZCislaPojistence = getDatumNarozeniZCisloPojistence(ZadankaData.TestovanyCisloPojistence);  

    var searchVariantJmenoPrijmeniDatumNarozeni = {
        Jmeno: ZadankaData.TestovanyJmeno,
        Prijmeni: ZadankaData.TestovanyPrijmeni,
        CisloPojistence: ZadankaData.TestovanyCisloPojistence,
        StatniPrislusnost: ZadankaData.TestovanyNarodnostKod,
        TypVyhledani: "JmenoPrijmeniRC"
    };

    var searchVariantJmenoPrijmeniDatumNarozeniSpatne = {
        Jmeno: ZadankaData.TestovanyJmeno,
        Prijmeni: ZadankaData.TestovanyPrijmeni,
        CisloPojistence: ZadankaData.TestovanyCisloPojistence,
        StatniPrislusnost: ZadankaData.TestovanyNarodnostKod,
        TypVyhledani: "JmenoPrijmeniRC"
    };

    var searchVariantJmenoPrijmeniDatumNarozeniMistoNarozeni = {
        Jmeno: ZadankaData.TestovanyJmeno,
        Prijmeni: ZadankaData.TestovanyPrijmeni,
        DatumNarozeni: ZadankaData.TestovanyDatumNarozeniText,
        StatniPrislusnost: ZadankaData.TestovanyNarodnostKod,
        CisloPojistence: ZadankaData.TestovanyCisloPojistence,
        TypVyhledani: "JmenoPrijmeniDatumNarozeniMistoNarozeni"
    };

    var searchVariantJmenoPrijmeniDatumNarozeniMistoNarozeniSpatneStatniPrislusnost = {
        Jmeno: ZadankaData.TestovanyJmeno,
        Prijmeni: ZadankaData.TestovanyPrijmeni,
        DatumNarozeni: getSpatneStatniPrislustnost(ZadankaData.TestovanyNarodnostKod),
        StatniPrislusnost: ZadankaData.TestovanyNarodnostKod,
        TypVyhledani: "JmenoPrijmeniDatumNarozeniMistoNarozeni"
    };

    var searchVariantJmenoPrijmeniDatumNarozeniMistoNarozeniSpatneDatumNarozeni = {
        Jmeno: ZadankaData.TestovanyJmeno,
        Prijmeni: ZadankaData.TestovanyPrijmeni,
        DatumNarozeni: DatumNarozeniSpatneVygenerovanyZCislaPojistence,
        StatniPrislusnost: ZadankaData.TestovanyNarodnostKod,
        TypVyhledani: "JmenoPrijmeniDatumNarozeniMistoNarozeni"
    };

    var searchVariantJmenoPrijmeniDatumNarozeniMistoNarozeniSpatneDatumNarozeniSpatneStatniPrislusnost = {
        Jmeno: ZadankaData.TestovanyJmeno,
        Prijmeni: ZadankaData.TestovanyPrijmeni,
        DatumNarozeni: DatumNarozeniSpatneVygenerovanyZCislaPojistence,
        StatniPrislusnost: getSpatneStatniPrislustnost(ZadankaData.TestovanyNarodnostKod),
        TypVyhledani: "JmenoPrijmeniDatumNarozeniMistoNarozeni"
    };

    var searchVariantCizinecJmenoPrijmeniDatumNarozniObcanstvi = {
        Jmeno: ZadankaData.TestovanyJmeno,
        Prijmeni: ZadankaData.TestovanyPrijmeni,
        DatumNarozeni: ZadankaData.TestovanyDatumNarozeniText,
        StatniPrislusnost: ZadankaData.TestovanyNarodnostKod,
        TypVyhledani: "CizinecJmenoPrijmeniDatumNarozniObcanstvi"
    };

    var searchVariantCizinecJmenoPrijmeniDatumNarozniObcanstviSpatneStatniPrislusnost = {
        Jmeno: ZadankaData.TestovanyJmeno,
        Prijmeni: ZadankaData.TestovanyPrijmeni,
        DatumNarozeni: ZadankaData.TestovanyDatumNarozeniText,
        StatniPrislusnost: getSpatneStatniPrislustnost(ZadankaData.TestovanyNarodnostKod),
        TypVyhledani: "CizinecJmenoPrijmeniDatumNarozniObcanstvi"
    };

    var searchVariantCizinecJmenoPrijmeniDatumNarozniObcanstviSpatneDatumNarozeniSpatneStatniPrislusnost = {
        Jmeno: ZadankaData.TestovanyJmeno,
        Prijmeni: ZadankaData.TestovanyPrijmeni,
        DatumNarozeni: DatumNarozeniSpatneVygenerovanyZCislaPojistence,
        StatniPrislusnost: getSpatneStatniPrislustnost(ZadankaData.TestovanyNarodnostKod),
        TypVyhledani: "CizinecJmenoPrijmeniDatumNarozniObcanstvi"
    };

    var searchVariantCizinecJmenoPrijmeniDatumNarozniObcanstviSpatneDatumNarozeni = {
        Jmeno: ZadankaData.TestovanyJmeno,
        Prijmeni: ZadankaData.TestovanyPrijmeni,
        DatumNarozeni: DatumNarozeniSpatneVygenerovanyZCislaPojistence,
        StatniPrislusnost: ZadankaData.TestovanyNarodnostKod,
        TypVyhledani: "CizinecJmenoPrijmeniDatumNarozniObcanstvi"
    };

    var searchVariantCizinecCisloPojistence = {
        Jmeno: ZadankaData.TestovanyJmeno,
        Prijmeni: ZadankaData.TestovanyPrijmeni,
        DatumNarozeni: ZadankaData.TestovanyDatumNarozeniText,
        StatniPrislusnost: ZadankaData.TestovanyNarodnostKod,
        CisloPojistence: ZadankaData.TestovanyCisloPojistence,
        TypVyhledani: "CizinecCisloPojistence"
    };

    var Profiles = [];
    loadOckoUzisPatientInfo(searchVariantJmenoPrijmeniDatumNarozeni, function(Profile1) {
        if(Profile1.Cislo) {
            Profiles.push(Profile1);
        }
        loadOckoUzisPatientInfo(searchVariantJmenoPrijmeniDatumNarozeniSpatne, function(Profile2) {
            if(Profile2.Cislo) {
                Profiles.push(Profile2);
            }
            loadOckoUzisPatientInfo(searchVariantCizinecJmenoPrijmeniDatumNarozniObcanstvi, function(Profile3) {
                if(Profile3.Cislo) {
                    Profiles.push(Profile3);
                }
                loadOckoUzisPatientInfo(searchVariantCizinecJmenoPrijmeniDatumNarozniObcanstviSpatneDatumNarozeni, function(Profile4) {
                    if(Profile4.Cislo) {
                        Profiles.push(Profile4);
                    }
                    loadOckoUzisPatientInfo(searchVariantCizinecJmenoPrijmeniDatumNarozniObcanstviSpatneStatniPrislusnost, function(Profile5) {
                        if(Profile5.Cislo) {
                            Profiles.push(Profile5);
                        }
                        loadOckoUzisPatientInfo(searchVariantCizinecJmenoPrijmeniDatumNarozniObcanstviSpatneDatumNarozeniSpatneStatniPrislusnost, function(Profile6) {
                            if(Profile6.Cislo) {
                                Profiles.push(Profile6);
                            }
                            loadOckoUzisPatientInfo(searchVariantJmenoPrijmeniDatumNarozeniMistoNarozeni, function(Profile7) {
                                if(Profile7.Cislo) {
                                    Profiles.push(Profile7);
                                }
                                loadOckoUzisPatientInfo(searchVariantJmenoPrijmeniDatumNarozeniMistoNarozeniSpatneDatumNarozeni, function(Profile8) {
                                    if(Profile8.Cislo) {
                                        Profiles.push(Profile8);
                                    }
                                    loadOckoUzisPatientInfo(searchVariantJmenoPrijmeniDatumNarozeniMistoNarozeniSpatneStatniPrislusnost, function(Profile9) {
                                        if(Profile9.Cislo) {
                                            Profiles.push(Profile9);
                                        }
                                        loadOckoUzisPatientInfo(searchVariantJmenoPrijmeniDatumNarozeniMistoNarozeniSpatneDatumNarozeniSpatneStatniPrislusnost, function(Profile10) {
                                            if(Profile10.Cislo) {
                                                Profiles.push(Profile10);
                                            }
                                            loadOckoUzisPatientInfo(searchVariantCizinecCisloPojistence, function(Profile11) {
                                                if(Profile11.Cislo) {
                                                    Profiles.push(Profile11);
                                                }                                                

                                                const filteredProfiles = Profiles.filter((obj, index, arr) => {
                                                    return arr.map(mapObj => mapObj.Cislo).indexOf(obj.Cislo) === index;
                                                });

                                                callback(filteredProfiles);
                                            });
                                        })
                                    });                            
                                });
                            });
                        });                        
                    });
                });
            });
        });
    });
}

function getDatumNarozeniZCisloPojistence(cisloPojistence) {
    if (!cisloPojistence) {
      return "";
    }

    var year = cisloPojistence.substring(0, 2);
    var month = cisloPojistence.substring(2, 4);
    var day = cisloPojistence.substring(4, 6);

    if(day > 50) {
      day = parseInt(day) - 50;
    }

    if(month > 50) {
        month = parseInt(month) - 50;
      }

    var actualYearLast2Pos = ((new Date()).getFullYear()).toString().substr(-2);
    if(year < actualYearLast2Pos) {
      year = "20" + year;
    } else {
      year = "19" + year;
    }

    if(month == 0 || month > 12) {
        month = 1;
    }

    switch(month) {
        case 1:
            day = (day == 0 || day > 31) ? 1 : day;
            break;
        case 2:
            day = (day == 0 || day > 28) ? 1 : day;
            break;
        case 3:
            day = (day == 0 || day > 31) ? 1 : day;
            break;
        case 4:
            day = (day == 0 || day > 30) ? 1 : day;
            break;
        case 5:
            day = (day == 0 || day > 31) ? 1 : day;
            break;
        case 6:
            day = (day == 0 || day > 30) ? 1 : day;
            break;
        case 7:
            day = (day == 0 || day > 31) ? 1 : day;
            break;
        case 8:
            day = (day == 0 || day > 31) ? 1 : day;
            break;
        case 9:
            day = (day == 0 || day > 30) ? 1 : day;
            break;
        case 10:
            day = (day == 0 || day > 31) ? 1 : day;
            break;
        case 11:
            day = (day == 0 || day > 30) ? 1 : day;
            break;
        case 12:
            day = (day == 0 || day > 31) ? 1 : day;
            break;
    }

    return day + "." + month + "." + year;
}

function tryToEditForeignProfile(index, ZadankaData, ProfileInfo, KoloOprav, onEnd) {
    var url = ProfileInfo.EditLink;

    var urlParams = getRegistrCUDZadankyPacientDetailEditUrlParams(
        (ZadankaData.TestovanyDatumNarozeniText != ProfileInfo.PacientDatumNarozeniText && ProfileInfo.PacientDatumNarozeniText == getDatumNarozeniZCisloPojistence(ZadankaData.TestovanyCisloPojistence)) ? ZadankaData.TestovanyDatumNarozeniText : null,
        !ProfileInfo.Telefon ? ZadankaData.TestovanyTelefon : null,
        !ProfileInfo.Email ? ZadankaData.TestovanyEmail : null
    );

    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    xhr.onreadystatechange = function() {
        if(xhr.readyState === XMLHttpRequest.DONE) {
            if(xhr.status == 200) {
                if(ZadankaData.TestovanyDatumNarozeniText != ProfileInfo.PacientDatumNarozeniText && ProfileInfo.PacientDatumNarozeniText == getDatumNarozeniZCisloPojistence(ZadankaData.TestovanyCisloPojistence)) {
                    console.log("Vyžádaná úprava k Excel řádku č. " + index+ ". " + KoloOprav + ". kolo oprav. Cizinec. Žádanka č. " + ZadankaData.Cislo + ". Byl upravený datum narození u pacienta č. " + ProfileInfo.Cislo + ".");
                } if(!ProfileInfo.Telefon && ZadankaData.TestovanyTelefon) {
                    console.log("Vyžádaná úprava k Excel řádku č. " + index + ". " + KoloOprav + ". kolo oprav. Cizinec. Žádanka č. " + ZadankaData.Cislo + ". Byl upravený telefon u pacienta č. " + ProfileInfo.Cislo + ".");
                }
                if(!ProfileInfo.Email && ZadankaData.TestovanyEmail) {
                    console.log("Vyžádaná úprava k Excel řádku č. " + index + ". " + KoloOprav + ". kolo oprav. Cizinec. Žádanka č. " + ZadankaData.Cislo + ". Byl upravený e-mail u pacienta č. " + ProfileInfo.Cislo + ".");
                }
                if(!ProfileInfo.Telefon && ZadankaData.TestovanyTelefon) {
                    console.log("Vyžádaná úprava k Excel řádku č. " + index + ". " + KoloOprav + ". kolo oprav. Cizinec. Žádanka č. " + ZadankaData.Cislo + ". CHYBA. Nepodařilo se upravit telefon u pacienta č. " + ProfileInfo.Cislo + ".");
                }
                if(!ProfileInfo.Email && ZadankaData.TestovanyEmail) {
                    console.log("Vyžádaná úprava k Excel řádku č. " + index + ". " + KoloOprav + ". kolo oprav. Cizinec. Žádanka č. " + ZadankaData.Cislo + ". CHYBA. Nepodařilo se upravit e-mail u pacienta č. " + PacientInfoSpatnyDatumNarozeni.Cislo + ".");
                }
            }
            onEnd();
        }
    }
    xhr.send(urlParams.toString());
}

async function tryToSloucitForeignProfilesToAnotherOne(index, ZadankaData, CisloPacienta, Profiles, KoloOprav) {

    return new Promise(function (resolve, reject) {
        var PocetSloucenoUspesne = 0;
        for(profileIndex = 0; profileIndex < Profiles.length; profileIndex++) {

            var SlucovanyProfil = Profiles[profileIndex];

            if(SlucovanyProfil.Cislo != CisloPacienta) {

                var SlucujiciProfil = {
                    Cislo: CisloPacienta
                }
                tryToSloucitForeignProfiles(index, ZadankaData, SlucujiciProfil, SlucovanyProfil, KoloOprav).then(function(SloucenoUspesne) {
                    if(SloucenoUspesne) {
                        PocetSloucenoUspesne++;
                    }
                    // TODO: dostane se sem index větší než Profiles.length
                    if((profileIndex + 1) >= Profiles.length) {
                        if(PocetSloucenoUspesne > 0) {
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    }
                });
            }
            else if((profileIndex + 1) == Profiles.length) {
                if(PocetSloucenoUspesne > 0) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            }
        }
    });
}

function trySloucitForeignProfilesFoundByZadankaData(index, ZadankaData, CisloPacienta, KoloOprav) {

    return new Promise(function (resolve, reject) {
        tryToFindForeignProfilesByZadankaData(ZadankaData, function(Profiles) {
            if(Profiles.length == 1 && Profiles[0].Cislo == CisloPacienta) {
                tryToEditForeignProfile(index, ZadankaData, Profiles[0], KoloOprav, function() {
                    resolve(false);
                });
            } else if (Profiles.length > 0) {
                tryToSloucitForeignProfilesToAnotherOne(index, ZadankaData, CisloPacienta, Profiles, KoloOprav).then(
                    function(AlesponJedenSloucenUspesne) {
                        if(AlesponJedenSloucenUspesne) {
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    }
                );
            } 
            // Varianty kdy to sem může skočit: 
            //     1) Pacient je poprvé na testu a ještě nebyl založený profil
            //     2) Bylo nalezeno více pacientů a UI vyhledání žádá o upřesnění zadaných údajů
            else {
                resolve(false);
            }
        });
    });
}

function getEregRegistrDomain() {
    return "ereg.ksrzis.cz";
}

function getEregRegistrUrl() {
    return "https://" + getEregRegistrDomain();
}

function getRegistrDomain() {
    return "eregpublicsecure.ksrzis.cz";
}

function getRegistrUrl() {
    return "https://" + getRegistrDomain();
}

function getRegistrCUDZadankyPacientDetailEditUrlParams(DatumNarozeni, Telefon, Email) {
    var urlParams = new URLSearchParams();
    
    if(DatumNarozeni) {
        urlParams.set("Pacient.DatumNarozeni", DatumNarozeni);
    }
    if(Telefon) {
        urlParams.set("Pacient.Telefon", Telefon);
    }
    if(Email) {
        urlParams.set("Pacient.Email", Email);
    }
    return urlParams;
}

function getRegistrCUDZadankyPacientDetailSloucitPacientyUrlParams(Id, SlucujiciCislo, SlucovanyCislo) {
    var urlParams = new URLSearchParams();
    if(Id) {
        urlParams.set("Id", Id);
    } else {
        urlParams.set("Id", null);
    }
    urlParams.set("SlucujiciCislo", SlucujiciCislo);
    urlParams.set("SlucovanyCislo", SlucovanyCislo);
    urlParams.set("_submit", "None");
    return urlParams;
}

function getRegistrCUDZadankyPacientDetailSloucitPacientyUrl(callback) {
    callback(getEregRegistrUrl() + "/Registr/CUDZadanky/PacientDetail/SloucitPacienty");
}

function getRegistrCUDOvereniCisloZadankyUrl(kodOsoby, heslo, cisloZadanky) {
    var urlParams = new URLSearchParams();
      
    urlParams.set("PracovnikKodOsoby", kodOsoby);
    urlParams.set("heslo", heslo);
    urlParams.set("Cislo", cisloZadanky);
      
    return getRegistrUrl() + "/Registr/CUD/Overeni/Json" + "?" + urlParams.toString();
}

function getRegistrCUDVyhledaniPacientaUrl() {
    return getEregRegistrUrl() + "/Registr/CUDZadanky/VyhledaniPacienta";
}

function getRegistrCUDVyhledaniPacientaUrlParams(zadanka) {
    var urlParams = new URLSearchParams();
    urlParams.set("DuvodVyhledani", "VyhledatPacienta");
    urlParams.set("TypVyhledani", zadanka.StatniPrislusnost == "CZ" ? "JmenoPrijmeniRC" : zadanka.TypVyhledani ? zadanka.TypVyhledani : "CizinecJmenoPrijmeniDatumNarozniObcanstvi");
    if(zadanka.TypVyhledani != "CizinecCisloPojistence") {
        urlParams.set("Jmeno", zadanka.Jmeno);
        urlParams.set("Prijmeni", zadanka.Prijmeni);
    }
    if(zadanka.CisloPojistence && zadanka.TypVyhledani && zadanka.TypVyhledani == "CizinecCisloPojistence") {
        urlParams.set("CisloPojistence", zadanka.CisloPojistence);
    }
    if(zadanka.StatniPrislusnost == "CZ") {
      urlParams.set("RodneCislo", zadanka.CisloPojistence);
    } else {
        if(zadanka.TypVyhledani != "CizinecCisloPojistence") {
            urlParams.set("DatumNarozeni", zadanka.DatumNarozeni);

            urlParams.set("ZemeKod", zadanka.StatniPrislusnost);
        }
    }
    urlParams.set("_submit", "None");
    return urlParams;
}

function loadOckoUzisPatientInfo(zadanka, callback) {

    var url = getRegistrCUDVyhledaniPacientaUrl();
    var urlParams = getRegistrCUDVyhledaniPacientaUrlParams(zadanka);

    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    xhr.onreadystatechange = function() {
        if(xhr.readyState === XMLHttpRequest.DONE && xhr.status == 200) {
  
            var parser = new DOMParser();
            var responseDocument = parser.parseFromString(xhr.responseText,"text/html");

            var results = {};

            var results = {
                Telefon: undefined,
                Email: undefined,
                Cislo: undefined,
                PacientDatumNarozeniText: undefined,
                Pacient_NarodnostKod: undefined,
                Pacient_RobObcanstviZemeKod: undefined,
            };
            
            var labels = responseDocument.getElementsByTagName('label');
            for (var i = 0; i < labels.length; i++) {
            switch(labels[i].htmlFor) {
                case 'Pacient_Telefon':
                    results.Telefon = labels[i].nextElementSibling.innerText.trim();
                    break;
                case 'Pacient_Email':
                    results.Email = labels[i].nextElementSibling.innerText.trim();
                    break;
                case 'Pacient_CisloPacienta':
                    results.Cislo = labels[i].nextElementSibling.innerText.trim();
                    break;
                case 'PacientDatumNarozeniText':
                    results.PacientDatumNarozeniText = labels[i].nextElementSibling.innerText.trim();
                    break;
                case 'Pacient_NarodnostKod':
                    results.Pacient_NarodnostKod = labels[i].nextElementSibling.innerText.trim();
                    break;
                case 'Pacient_RobObcanstviZemeKod':
                    results.Pacient_RobObcanstviZemeKod = labels[i].nextElementSibling.innerText.trim();
                    break;
                }
            }

            results.Link = xhr.responseURL;
            results.EditLink = xhr.responseURL.replace("Index", "Edit");
  
            callback(results);
        }
    }
    xhr.send(urlParams.toString());
}

async function getZadankaData(cisloZadanky) {

    return new Promise(function (resolve, reject) {

        getRegistrLoginCookies(function (cookieParams) {

            var kodOsoby = cookieParams.get("kodOsoby");
            var heslo = cookieParams.get("heslo");
        
            if(!kodOsoby || !heslo) {
                resolve();
            }

            var url = getRegistrCUDOvereniCisloZadankyUrl(kodOsoby, heslo, cisloZadanky);
  
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.setRequestHeader("Content-Type","application/json; charset=UTF-8");
            xhr.onreadystatechange = function() {
                if(xhr.readyState == XMLHttpRequest.DONE) {
                    if(xhr.status == 200) {
                        var data = JSON.parse(xhr.responseText);
                        resolve(data);
                    } else {
                        resolve();
                    }
                }
            };
            xhr.send();
        });
    });
}

