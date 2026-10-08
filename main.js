'use strict';

const utils = require('@iobroker/adapter-core');
const axios = require('axios');

class Solaredge extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'solaredge',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        this.log.info('Starting SolarEdge API v2 Migration-Adapter');

        // Überprüfung der Konfiguration
        if (!this.config.siteid || !this.config.apikey) {
            this.log.error('Site ID oder API Key fehlen in der Konfiguration!');
            this.terminate ? this.terminate() : process.exit();
            return;
        }

        // Falls Intervalle ungültig sind (Minuten in Millisekunden umrechnen)
        let checkInterval = parseInt(this.config.interval, 10) || 15;
        if (checkInterval < 15) {
            this.log.warn('Das minimale Abfrageintervall für die Cloud beträgt 15 Minuten. Wert wurde angepasst.');
            checkInterval = 15;
        }

        const intervalMs = checkInterval * 60 * 1000;

        // Erste Abfrage direkt beim Start
        await this.getSolarEdgeData();

        // Zyklische Abfrage starten
        this.dataInterval = this.setInterval(async () => {
            await this.getSolarEdgeData();
        }, intervalMs);
    }

    /**
     * Ruft die Daten über die neue SolarEdge API v2 ab
     */
    async getSolarEdgeData() {
        // API v2 verlangt Plural "sites" und den Key im Header
        const url = `https://solaredge.com{this.config.siteid}/overview`;

        this.log.debug(`Rufe SolarEdge v2 API auf: ${url}`);

        try {
            const response = await axios.get(url, {
                headers: {
                    'X-API-Key': this.config.apikey,
                    'Accept': 'application/json'
                },
                timeout: 10000 // 10 Sekunden Timeout
            });

            if (response.data && response.data.overview) {
                const overview = response.data.overview;
                this.log.debug(`Daten erfolgreich empfangen: ${JSON.stringify(overview)}`);

                // Datenpunkte schreiben (erstellt sie falls nicht vorhanden)
                await this.setStateChangedAsync('lastUpdateTime', { val: overview.lastUpdateTime, ack: true });

                if (overview.currentPower) {
                    await this.setStateChangedAsync('currentPower', { val: parseFloat(overview.currentPower.power), ack: true });
                }
                if (overview.lastDayData) {
                    await this.setStateChangedAsync('lastDayEnergy', { val: parseFloat(overview.lastDayData.energy), ack: true });
                }
                if (overview.lastMonthData) {
                    await this.setStateChangedAsync('lastMonthEnergy', { val: parseFloat(overview.lastMonthData.energy), ack: true });
                }
                if (overview.lastYearData) {
                    await this.setStateChangedAsync('lastYearEnergy', { val: parseFloat(overview.lastYearData.energy), ack: true });
                }
                if (overview.lifeTimeData) {
                    await this.setStateChangedAsync('lifeTimeEnergy', { val: parseFloat(overview.lifeTimeData.energy), ack: true });
                }

                this.log.info('SolarEdge v2 Daten erfolgreich aktualisiert.');
            } else {
                this.log.warn(`Unerwartete Antwortstruktur von SolarEdge: ${JSON.stringify(response.data)}`);
            }

        } catch (error) {
            this.log.error(`Fehler beim Abruf der SolarEdge v2 API: ${error.message}`);
            if (error.response) {
                this.log.error(`API Status Code: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            }
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            if (this.dataInterval) {
                this.clearInterval(this.dataInterval);
            }
            this.log.info('SolarEdge Adapter sauber beendet.');
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Solaredge(options);
} else {
    // otherwise start the instance directly
    new Solaredge();
}
