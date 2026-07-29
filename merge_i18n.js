import fs from 'fs';
import path from 'path';

const localesDir = path.join(process.cwd(), 'src', 'i18n', 'locales');

function mergeLocales(lang) {
    const mainFile = path.join(localesDir, `${lang}.json`);
    let mainData = {};
    if (fs.existsSync(mainFile)) {
        mainData = JSON.parse(fs.readFileSync(mainFile, 'utf8'));
    }

    for (let i = 1; i <= 4; i++) {
        const partFile = path.join(localesDir, `${lang}_part${i}.json`);
        if (fs.existsSync(partFile)) {
            const partData = JSON.parse(fs.readFileSync(partFile, 'utf8'));
            // Deep merge function
            const deepMerge = (target, source) => {
                for (const key of Object.keys(source)) {
                    if (source[key] instanceof Object && key in target) {
                        Object.assign(source[key], deepMerge(target[key], source[key]));
                    }
                }
                Object.assign(target || {}, source);
                return target;
            };
            mainData = deepMerge(mainData, partData);
            console.log(`Merged ${lang}_part${i}.json`);
            fs.unlinkSync(partFile);
        }
    }

    fs.writeFileSync(mainFile, JSON.stringify(mainData, null, 2), 'utf8');
    console.log(`Updated ${mainFile}`);
}

mergeLocales('en');
mergeLocales('ru');
