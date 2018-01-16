package cz.cuni.mff.ufal;

import javax.jms.*;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import org.apache.activemq.ActiveMQConnection;
import org.apache.activemq.ActiveMQConnectionFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

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

    public String get(int timeout) throws JMSException {

        Message message = messageConsumer.receive(timeout);
        String msg = processMessage(message);
        msg = "Hello " + msg + "!";
        LOGGER.info(msg);
        return msg;
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
        } else {
            LOGGER.debug("no TextMessage received");
        }
        return msg;
    }

    public static void main(String[] args) {
        LOGGER.info("main started");
        LOGGER.debug("debug is active");
        App m = new App();
        try {
            m.create("fedora");
            //m.get(100_000_000);
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
