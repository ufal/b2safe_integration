package cz.cuni.mff.ufal;

import javax.jms.*;

import com.google.gson.*;
import com.hp.hpl.jena.rdf.model.*;
import org.apache.activemq.ActiveMQConnection;
import org.apache.activemq.ActiveMQConnectionFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.DataOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

public class App implements MessageListener {

    private static final Logger LOGGER = LoggerFactory.getLogger(App.class);
    private Connection connection;
    private Session session;
    private MessageConsumer messageConsumer;

    public void create(String topicName) throws JMSException {
        ConnectionFactory connectionFactory =
                new ActiveMQConnectionFactory(ActiveMQConnection.DEFAULT_BROKER_URL);
        connection = connectionFactory.createConnection();
        connection.setClientID("cliendID");
        session = connection.createSession(false, Session.AUTO_ACKNOWLEDGE);
        Topic topic = session.createTopic(topicName);
        messageConsumer = session.createDurableSubscriber(topic, "");
        messageConsumer.setMessageListener(this);
        connection.start();
    }

    private String processMessage(Message message) throws JMSException {
        String msg = "";
        if (message != null && message instanceof TextMessage) {
            TextMessage textMessage = (TextMessage) message;
            // retrieve the message content
            String text = textMessage.getText();
            Gson gson = new GsonBuilder().setPrettyPrinting().create();
            JsonParser jp = new JsonParser();
            JsonElement je = jp.parse(text);
            msg = gson.toJson(je);
            LOGGER.debug("received message with text='{}'", msg);
            JsonObject messageObject = je.getAsJsonObject();
            String url = messageObject.getAsJsonPrimitive("id").getAsString();
            String metadataUrl = url + "/fcr:metadata";
            List<String> types = StreamSupport.stream(messageObject.getAsJsonArray("type").spliterator(),
                    false).map(jsonElement -> jsonElement.getAsString()).collect(Collectors.toList());
            List<String> eventTypes = StreamSupport.stream(messageObject.getAsJsonObject("wasGeneratedBy")
                    .getAsJsonArray( "type").spliterator(), false).map(jsonElement -> jsonElement.getAsString())
                    .collect(Collectors.toList());
            if(types.contains("http://fedora.info/definitions/v4/repository#Binary") && eventTypes.contains("http://fedora.info/definitions/v4/event#ResourceCreation")){
                Model model = ModelFactory.createDefaultModel();
                model.read(metadataUrl,"Turtle");
                StmtIterator iter = model.listStatements(new SimpleSelector(null, ResourceFactory.createProperty("http://www.ebu.ch/metadata/ontologies/ebucore/ebucore#filename"), (RDFNode)null));
                while (iter.hasNext()){
                    Statement statement = iter.nextStatement();
                    RDFNode object = statement.getObject();
                    if(object.isLiteral()){
                        String filename = object.asLiteral().getString();
                        LOGGER.debug("Got " + filename);
                        break;
                    }else {
                        LOGGER.error("Don't know what to do - not a literal");
                    }
                }
            }else {
                LOGGER.debug(String.format("The types were %s and eventTypes %s", String.join(", ", types), String
                        .join(", ", eventTypes)));
            }

        } else {
            LOGGER.debug("no TextMessage received");
        }
        return msg;
    }

    private static void callReplicationService(String handle, String filePath) throws Exception {
        String urlParameters  = "handle=" + handle + "&filename=" + filePath + "&checksum=";
        byte[] postData       = urlParameters.getBytes(StandardCharsets.UTF_8);
        int    postDataLength = postData.length;
        String request        = "http://localhost:3000/replicate"; // hardcoded for testing
        URL    url            = new URL( request );
        HttpURLConnection conn= (HttpURLConnection) url.openConnection();
        conn.setDoOutput(true);
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        conn.setRequestProperty( "Content-Length", Integer.toString(postDataLength));
        conn.setUseCaches( false );
        try( DataOutputStream wr = new DataOutputStream( conn.getOutputStream())) {
            wr.write( postData );
            wr.flush();
            wr.close();
        } catch(Exception e) {
            LOGGER.error(e.getMessage());
        }
        int responseCode = conn.getResponseCode();
        LOGGER.info("Response code " + responseCode);
    }

    public static void main(String[] args) {
        LOGGER.info("main started");
        LOGGER.debug("debug is active");
        App m = new App();
        try {
            m.create("fedora");
        } catch (JMSException e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onMessage(Message message) {
        try {
            processMessage(message);
        }catch (JMSException e){
            LOGGER.error(e.getMessage());
        }
    }
}
