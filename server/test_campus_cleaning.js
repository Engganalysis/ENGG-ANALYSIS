const campusList = [
    "BAL/PU COLLEGE BALLARI BOYS",
    "BEN/PU COLLEGE ATTIBELE",
    "BEN/PU COLLEGE BANASWADI",
    "BEN/PU COLLEGE BELLANDUR",
    "BEN/PU COLLEGE BYATARAYANAPURA",
    "BEN/PU COLLEGE ELECTRONIC CITY",
    "BEN/PU COLLEGE HEGDENAGAR",
    "BEN/PU COLLEGE HORAMAVU",
    "BEN/PU COLLEGE J P NAGAR",
    "BEN/PU COLLEGE KAGGADASPURA",
    "BEN/PU COLLEGE KANAKAPURA ROAD",
    "BEN/PU COLLEGE KORAMANGALA",
    "BEN/PU COLLEGE KR PURAM",
    "BEN/PU COLLEGE KUDLU",
    "BEN/PU COLLEGE MARTHAHALLI C-120",
    "BEN/PU COLLEGE NAGARBHAVI",
    "BEN/PU COLLEGE PEENYA DASARAHALLI",
    "BEN/PU COLLEGE SARJAPURA",
    "BEN/PU COLLEGE SESHADRIPURAM",
    "BEN/PU COLLEGE UTTARAHALLI",
    "BEN/PU COLLEGE VIDYARANYAPURA",
    "HUB/PU COLLEGE HUBLI",
    "HUB/PU COLLEGE HUBLI 2",
    "MAN/PU COLLEGE MANDYA",
    "MAN/PU COLLEGE MANGALORE",
    "MYS/PU COLLEGE MYSORE",
    "MYS/PUC DR BS RAO VIDYASOUDHA MYSORE",
    "TUM/PU COLLEGE TUMKUR"
];

function cleanCampusName(name) {
    // 1. Remove the code before / (e.g., BEN/)
    let cleaned = name.includes('/') ? name.split('/')[1] : name;

    // 2. Remove common prefixes like 'PU COLLEGE ' and 'PUC '
    cleaned = cleaned.replace(/PU COLLEGE\s+/i, '');
    cleaned = cleaned.replace(/PUC\s+/i, '');

    return cleaned.trim();
}

console.log("--- CLEANED CAMPUS NAMES ---");
campusList.forEach(original => {
    console.log(`${original}  ==>  ${cleanCampusName(original)}`);
});
