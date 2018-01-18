package cz.cuni.mff.ufal;

import javax.jms.*;

import com.google.gson.*;
import com.hp.hpl.jena.rdf.model.*;
import org.apache.activemq.ActiveMQConnection;
import org.apache.activemq.ActiveMQConnectionFactory;
import org.apache.commons.configuration2.builder.fluent.Configurations;
import org.apache.commons.configuration2.ex.ConfigurationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.DataOutputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

import org.apache.commons.configuration2.*;

import static org.apache.commons.lang3.StringUtils.isNotBlank;

public class App implements MessageListener {

    private static final Logger LOGGER = LoggerFactory.getLogger(App.class);
    private Connection connection;
    private Session session;
    private MessageConsumer messageConsumer;
    private String replicationServiceUrl;
    private String assetstorePath;


    public App(Configuration config){
        replicationServiceUrl = config.getString("replication.service.url",
                "http://localhost:3000/replicate");
        LOGGER.debug("replication.service.url" + replicationServiceUrl);
        assetstorePath = config.getString("assetstore.path",
                "./");
        LOGGER.debug("assetstore.path=" + assetstorePath);

    }

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
            String id = messageObject.getAsJsonPrimitive("id").getAsString();
            String metadataUrl = id + "/fcr:metadata";
            List<String> types = StreamSupport.stream(messageObject.getAsJsonArray("type").spliterator(),
                    false).map(jsonElement -> jsonElement.getAsString()).collect(Collectors.toList());
            List<String> eventTypes = StreamSupport.stream(messageObject.getAsJsonObject("wasGeneratedBy")
                    .getAsJsonArray( "type").spliterator(), false).map(jsonElement -> jsonElement.getAsString())
                    .collect(Collectors.toList());
            if(types.contains("http://fedora.info/definitions/v4/repository#Binary") && eventTypes.contains("http://fedora.info/definitions/v4/event#ResourceCreation")){
                Model model = ModelFactory.createDefaultModel();
                model.read(metadataUrl,"Turtle");
                String filename = "";
                //Get filename from metadata
                StmtIterator iter = model.listStatements(new SimpleSelector(null, ResourceFactory.createProperty("http://www.ebu.ch/metadata/ontologies/ebucore/ebucore#filename"), (RDFNode)null));
                while (iter.hasNext()){
                    Statement statement = iter.nextStatement();
                    RDFNode object = statement.getObject();
                    if(object.isLiteral()){
                        filename = object.asLiteral().getString();
                        LOGGER.debug("Filename is " + filename);
                        break;
                    }else {
                        LOGGER.error("Don't know what to do - not a literal");
                    }
                }
                String sha1 = "";
                //Get sha1 from metadata
                iter = model.listStatements(new SimpleSelector(null, ResourceFactory.createProperty("http://www.loc.gov/premis/rdf/v1#hasMessageDigest"), (RDFNode)null));
                while (iter.hasNext()){
                    Statement statement = iter .nextStatement();
                    RDFNode object = statement.getObject();
                    if(object.isResource()){
                        sha1 = object.toString().replace("urn:sha1:", "");
                        LOGGER.debug("sha1 is " + sha1);
                    }else {
                        LOGGER.error("Don't have message digest in expect format");
                    }
                }

                if(isNotBlank(filename) && isNotBlank(sha1)){
                    try {
                        //TODO cleanup
                        Path dir = Files.createTempDirectory(sha1);
                        Files.setPosixFilePermissions(dir, PosixFilePermissions.fromString("rwxrwxrwx"));
                        LOGGER.debug("Created " + dir.toString());
                        Path metadata = dir.resolve("metadata.ttl");
                        Path file = dir.resolve(filename);
                        Path fedoraFile = Paths.get(assetstorePath, sha1.substring(0,2), sha1.substring(2,4),
                                sha1.substring(4,6), sha1);
                        Files.copy(fedoraFile, file);
                        model.write(new FileWriter(metadata.toFile()), "Turtle");
                        callReplicationService(id, metadata);
                        callReplicationService(id, file);

                    } catch (IOException e) {
                        LOGGER.error(e.getMessage());
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

    private void callReplicationService(String id, Path path) throws IOException {
        String urlParameters  = "handle=" + id + "&filename=" + path.toString();
        byte[] postData       = urlParameters.getBytes(StandardCharsets.UTF_8);
        int    postDataLength = postData.length;
        URL    url            = new URL( this.replicationServiceUrl );
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
        Configurations configs = new Configurations();
        try{
            Configuration config = configs.properties("config.properties");
            App m = new App(config);
            try {
                m.create("fedora");
            } catch (JMSException e) {
                e.printStackTrace();
            }
        }catch (ConfigurationException e){
            LOGGER.error(e.getMessage());
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
