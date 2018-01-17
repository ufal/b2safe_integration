This patch will add ItemModifyB2SafeConsumer to dspace that will send item modification to b2safe server.

## How to install

Install DSpace see https://github.com/ufal/clarin-dspace for help

Clone the patch repository :
`https://github.com/ufal/b2safe_dspace_patch.git`

Goto the DSpace source and apply patch

cd [DSPACE_SOURCE]

`sudo git apply [PATCH_repository_path]/b2safe-dspace.patch`

Add ItemModifyB2SafeConsumer to the dspace.cfg 

Add following lines
`
event.consumer.b2safe.class = cz.cuni.mff.ufal.dspace.b2safe.ItemModifyB2SafeConsumer
event.consumer.b2safe.filters = Community|Collection|Item+Create|Modify
`

and then append to the list of consumers
`event.dispatcher.default.consumers = XYZ, b2safe`


Compile and deploy dspace

for CLARIN Dsapce
`
cd utilities/project_helpers/scripts/
make deploy
make restart
`


