# fedoraconnector

```
mvn package
java -jar target/fedora-connector-1.0-SNAPSHOT-jar-with-dependencies.jar
```

Create `config.properties` in the same directory. This file sets the path to fedora binaries and url of replication
service if the default `http://localhost:3000/replicate` is not valid.

## Ensure all binary data are stored in the binary store directory

You can use this configuration in `repository.json` (See https://github.com/ufal/b2safe_integration/issues/12)
```
  "minimumBinarySizeInBytes" : 0,
  "minimumStringSize" : 4096
```
