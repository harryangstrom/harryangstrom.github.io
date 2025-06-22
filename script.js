const { createApp } = Vue;

createApp({
    data() {
        return {
            // Estado de la UI
            showLogin: true,
            isConnecting: false,
            loginError: '',
            
            // Credenciales del formulario
            inputUsername: '',
            inputPassword: '',

            // Estado de la IA
            showAnalysisModal: false,
            isGeneratingAnalysis: false,
            analysisResult: '',

            // Configuración del broker MQTT
            mqttConfig: {
                host: '50f200f8e4b94467b48eafbbc2d6ca66.s2.eu.hivemq.cloud',
                port: 8884,
                username: '',
                password: '',
                clientId: 'vue-mqtt-client-' + Math.random().toString(16).substr(2, 8),
                topic: 'tele/+/SENSOR'
            },
            mqttClient: null,
            connected: false,
            devices: {} 
        }
    },
    computed: {
        connectionStatusText() { return this.connected ? 'Conectado' : 'Desconectado'; },
        connectionStatusClass() {
            return {
                'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100': this.connected,
                'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100': !this.connected,
            };
        },
        sortedDevices() { return Object.values(this.devices).sort((a, b) => a.id.localeCompare(b.id)); }
    },
    methods: {
        // --- Métodos de Autenticación y Conexión MQTT ---
        handleLogin() {
            if (!this.inputUsername || !this.inputPassword) {
                this.loginError = 'Por favor, introduce usuario y contraseña.';
                return;
            }
            this.loginError = '';
            this.isConnecting = true;
            this.mqttConfig.username = this.inputUsername;
            this.mqttConfig.password = this.inputPassword;
            this.connectMqtt();
        },
        disconnect() {
            if (this.mqttClient && this.connected) { try { this.mqttClient.disconnect(); } catch(e) { console.error("Error al desconectar:", e); } }
            this.connected = false;
            this.showLogin = true;
            this.loginError = '';
            this.devices = {};
            this.mqttClient = null;
        },
        connectMqtt() {
            this.mqttClient = new Paho.MQTT.Client(this.mqttConfig.host, this.mqttConfig.port, this.mqttConfig.clientId);
            this.mqttClient.onConnectionLost = this.onConnectionLost;
            this.mqttClient.onMessageArrived = this.onMessageArrived;
            const connectOptions = {
                userName: this.mqttConfig.username,
                password: this.mqttConfig.password,
                onSuccess: this.onConnect,
                onFailure: this.onFailure,
                useSSL: true, timeout: 5, cleanSession: true
            };
            this.mqttClient.connect(connectOptions);
        },
        onConnect() {
            console.log("Conectado exitosamente al broker MQTT!");
            this.connected = true;
            this.isConnecting = false;
            this.showLogin = false;
            this.mqttClient.subscribe(this.mqttConfig.topic);
            console.log(`Suscrito al tópico: ${this.mqttConfig.topic}`);
        },
        onFailure(response) {
            console.error("Fallo al conectar a MQTT: ", response.errorMessage);
            this.connected = false; this.isConnecting = false;
            this.loginError = `Error de conexión. Verifica tus credenciales.`;
        },
        onConnectionLost(responseObject) {
            if (responseObject.errorCode !== 0) {
                console.warn("Conexión MQTT perdida: " + responseObject.errorMessage);
                this.disconnect();
                this.loginError = 'Se ha perdido la conexión con el servidor.';
            }
        },
        onMessageArrived(message) {
            try {
                const topic = message.destinationName;
                const payload = message.payloadString;
                const deviceId = topic.split('/')[1];
                if (!deviceId) return;

                const data = JSON.parse(payload);
                let temperature = null;
                if (typeof data.temperature === 'number') { temperature = data.temperature; } 
                else {
                    for (const key in data) {
                        if (typeof data[key] === 'object' && data[key] !== null && typeof data[key].Temperature === 'number') {
                            temperature = data[key].Temperature; break;
                        }
                    }
                }
                if (temperature === null) return;
                this.devices[deviceId] = { id: deviceId, temperature: temperature, lastUpdate: new Date() };
            } catch (error) { console.error("Error al procesar el mensaje MQTT:", error); }
        },
        formatTimestamp(date) { return date ? date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''; },

        // --- Métodos para la Integración con Gemini API ---
        async callGeminiAPI(prompt) {
            this.analysisResult = '';
            this.isGeneratingAnalysis = true;
            this.showAnalysisModal = true;

            const apiKey = ""; // La clave de API se inyectará en tiempo de ejecución
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const payload = {
                contents: [{ role: "user", parts: [{ text: prompt }] }]
            };

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`Error de la API: ${response.statusText}`);
                }

                const result = await response.json();
                
                if (result.candidates && result.candidates.length > 0) {
                    const text = result.candidates[0].content.parts[0].text;
                    // Reemplazar saltos de línea con <br> para HTML y dar formato básico
                    this.analysisResult = text
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Negrita
                        .replace(/\*(.*?)\*/g, '<em>$1</em>') // Cursiva
                        .replace(/\n/g, '<br>');
                } else {
                    throw new Error("La respuesta de la API no contiene texto válido.");
                }

            } catch (error) {
                console.error("Error al llamar a la API de Gemini:", error);
                this.analysisResult = `<p class="text-red-500">Lo siento, ha ocurrido un error al generar el análisis. Por favor, inténtalo de nuevo.</p><p class="text-xs mt-2 text-gray-400">Error: ${error.message}</p>`;
            } finally {
                this.isGeneratingAnalysis = false;
            }
        },
        
        generateOverallAnalysis() {
            const deviceDataString = Object.values(this.devices)
                .map(d => `- Dispositivo '${d.id}': ${d.temperature.toFixed(1)}°C`)
                .join('\n');

            const prompt = `Eres un asistente experto en análisis de datos de IoT. A continuación se presentan las lecturas de temperatura de varios sensores en una ubicación.

Datos de los sensores:
${deviceDataString}

Por favor, proporciona un análisis conciso en español que incluya:
1.  Un resumen general del clima del entorno.
2.  La temperatura promedio de todos los sensores.
3.  Identificación de cualquier sensor con lecturas notablemente altas o bajas en comparación con el resto.
4.  Una conclusión o recomendación general basada en los datos.

Formatea tu respuesta de manera clara y fácil de leer, usando negritas para los títulos.`;
            
            this.callGeminiAPI(prompt);
        },

        interpretDeviceTemperature(device) {
            const prompt = `Un sensor de IoT llamado '${device.id}' reporta una temperatura de ${device.temperature.toFixed(1)}°C. 

Considerando un entorno estándar como una casa u oficina, ¿qué significa esta temperatura? 

Proporciona una breve interpretación y una recomendación práctica en no más de 3 frases. Responde en español.`;
            
            this.callGeminiAPI(prompt);
        }
    },
}).mount('#app');
