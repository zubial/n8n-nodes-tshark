export class TsharkUtils {
	/**
	 * Vérifie si une chaîne est une chaîne hexadécimale valide.
	 * @param str La chaîne à tester.
	 * @returns True si la chaîne est hexadécimale (et longueur paire), sinon false.
	 */
	static isHex(str: string): boolean {
		const hexRegex = /^[0-9A-Fa-f]+$/;
		return hexRegex.test(str) && str.length % 2 === 0;
	}

	/**
	 * Décodage conditionnel du SSID.
	 * Si le SSID est hexadécimal, le décode en UTF-8, sinon il le retourne tel quel.
	 * @param ssid La chaîne SSID obtenue.
	 * @returns Le SSID décodé ou la chaîne originale.
	 */
	static decodeSSID(ssid: string): string {
		if (this.isHex(ssid)) {
			return Buffer.from(ssid, 'hex').toString('utf8');
		} else {
			// La chaîne semble déjà être lisible
			return ssid;
		}
	}
}
