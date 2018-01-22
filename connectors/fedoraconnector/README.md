# fedoraconnector

```
mvn package
java -jar target/fedora-connector-1.0-SNAPSHOT-jar-with-dependencies.jar
```

Create `config.properties` in the same directory. This file sets the path to fedora binaries and url of replication
service if the default `http://localhost:3000/replicate` is not valid.
