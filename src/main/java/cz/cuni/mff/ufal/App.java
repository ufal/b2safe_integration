package cz.cuni.mff.ufal;

import javax.jms.Connection;
import javax.jms.ConnectionFactory;
import javax.jms.JMSException;
import javax.jms.Message;
import javax.jms.MessageConsumer;
import javax.jms.Session;
import javax.jms.TextMessage;
import javax.jms.Topic;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import org.apache.activemq.ActiveMQConnection;
import org.apache.activemq.ActiveMQConnectionFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class App {

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
        connection.start();
    }

    public String get(int timeout) throws JMSException {

        Message message = messageConsumer.receive(timeout);
        String msg = "";
        if (message != null) {
            TextMessage textMessage = (TextMessage) message;
            // retrieve the message content
            String text = textMessage.getText();
            Gson gson = new GsonBuilder().setPrettyPrinting().create();
            JsonParser jp = new JsonParser();
            JsonElement je = jp.parse(text);
            LOGGER.debug("received message with text='{}'", gson.toJson(je));
            msg = "Hello " + gson.toJson(je) + "!";
        } else {
            LOGGER.debug("no message received");
        }
        LOGGER.info(msg);
        return msg;
    }

    public static void main(String[] args) {
        LOGGER.info("main started");
        LOGGER.debug("debug is active");
        App m = new App();
        try {
            m.create("fedora");
            m.get(100_000_000);
        } catch (JMSException e) {
            e.printStackTrace();
        }
    }
}
